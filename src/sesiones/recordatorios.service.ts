import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  PARAMETRO,
  ParametrosService,
} from '../common/parametros/parametros.service.js';
import { RANGO_PARAMETRO } from '../common/parametros/rangos-parametros.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import {
  NOTIFICACION,
  NotificacionesService,
} from '../notificaciones/notificaciones.service.js';
import { fechaDeHoy, sumarDias, ZONA_HORARIA } from './alertas.js';
import type {
  ProyectoConPendientesDto,
  ResultadoRecordatoriosDto,
} from './dto/respuestas.dto.js';
import { SesionesService } from './sesiones.service.js';

export const MENSAJE_RECORDATORIOS_EN_CURSO =
  'Ya se están enviando los recordatorios. Espere un momento y vuelva a consultar.';

/** Cuántos cursos se nombran en el aviso; los demás se cuentan. */
const CURSOS_NOMBRADOS = 3;

/**
 * RF-26, HU-13-02: recordatorio de sesiones pendientes. Un solo aviso por docente con todas sus
 * sesiones vencidas y por vencer (RF-26, excepción de p2), con la periodicidad del parámetro
 * `recordatorio_sesiones_dias`.
 *
 * Se revisa todos los días a las 7:00 (hora de Colombia), y a cada docente se le envía solo si
 * su último recordatorio tiene esa cantidad de días o más. Como eso se lee de `notificacion`, un
 * reinicio del servidor o un envío manual no duplican el aviso, y un cambio del parámetro rige
 * desde la siguiente revisión, sin redesplegar (HU-13-04).
 *
 * El tipo del aviso es `sesion_vencida` si tiene alguna vencida y `sesion_por_vencer` si solo
 * tiene por vencer. Así el administrador puede apagar uno sin apagar el otro (HU-13-04). Si el
 * tipo que le toca a un docente está apagado, ese docente no recibe recordatorio.
 */
@Injectable()
export class RecordatoriosService {
  private readonly logger = new Logger(RecordatoriosService.name);
  /**
   * Evita que la revisión programada y un envío manual corran a la vez y dupliquen avisos.
   * Vive en memoria: basta con un solo backend, como en el despliegue actual. Con dos réplicas,
   * las dos correrían a las 7:00 y enviarían dos veces; entonces haría falta un candado de MySQL
   * (`GET_LOCK('urap_recordatorio_sesiones', 0)`) sobre una misma conexión, con el mismo 409.
   */
  private enCurso = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sesiones: SesionesService,
    private readonly notificaciones: NotificacionesService,
    private readonly parametros: ParametrosService,
  ) {}

  /** La revisión diaria. En las pruebas no corre: las pruebas llaman a `enviar`. */
  @Cron('0 7 * * *', {
    name: 'recordatorio-sesiones',
    timeZone: ZONA_HORARIA,
    disabled: process.env.NODE_ENV === 'test',
  })
  async revisarDiariamente(): Promise<void> {
    try {
      const resultado = await this.enviar();
      this.logger.log(
        `Recordatorio de sesiones: ${resultado.enviados} enviados de ` +
          `${resultado.docentesConPendientes} docentes con pendientes.`,
      );
    } catch (error) {
      this.logger.error(
        'No se pudo enviar el recordatorio de sesiones pendientes.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Envía el recordatorio a cada docente con pendientes que no lo haya recibido dentro de la
   * periodicidad. Lo usan la revisión diaria y el botón del administrador.
   */
  async enviar(ahora: Date = new Date()): Promise<ResultadoRecordatoriosDto> {
    if (this.enCurso) {
      throw new ConflictException(MENSAJE_RECORDATORIOS_EN_CURSO);
    }
    this.enCurso = true;
    try {
      return await this.enviarSinBloqueo(ahora);
    } finally {
      this.enCurso = false;
    }
  }

  private async enviarSinBloqueo(
    ahora: Date,
  ): Promise<ResultadoRecordatoriosDto> {
    const resultado: ResultadoRecordatoriosDto = {
      periodicidadDias: null,
      docentesConPendientes: 0,
      enviados: 0,
      omitidosPorPeriodicidad: 0,
      omitidosPorTipoInactivo: 0,
    };
    // Sin periodicidad válida no se envía: el error queda en el registro técnico.
    const dias = await this.parametros.leerEntero(
      PARAMETRO.recordatorioSesionesDias,
      RANGO_PARAMETRO[PARAMETRO.recordatorioSesionesDias],
    );
    if (dias === null) {
      return resultado;
    }
    resultado.periodicidadDias = dias;

    const porDocente = await this.sesiones.pendientesPorDocente();
    resultado.docentesConPendientes = porDocente.size;
    if (porDocente.size === 0) {
      return resultado;
    }

    const tipos = await this.prisma.tipo_notificacion.findMany({
      where: {
        codigo: {
          in: [NOTIFICACION.sesionVencida, NOTIFICACION.sesionPorVencer],
        },
      },
      select: { id: true, codigo: true, activo: true },
    });
    const activos = new Set(
      tipos.filter((tipo) => tipo.activo !== false).map((tipo) => tipo.codigo),
    );
    const recientes = await this.conRecordatorioReciente(
      [...porDocente.keys()],
      tipos.map((tipo) => tipo.id),
      inicioDelDia(sumarDias(fechaDeHoy(ahora), 1 - dias)),
    );

    for (const [idUsuario, proyectos] of porDocente) {
      if (recientes.has(idUsuario)) {
        resultado.omitidosPorPeriodicidad += 1;
        continue;
      }
      const aviso = recordatorioDe(proyectos);
      if (!activos.has(aviso.tipo)) {
        resultado.omitidosPorTipoInactivo += 1;
        continue;
      }
      await this.notificaciones.notificar({
        ...aviso,
        destinatarios: [idUsuario],
      });
      resultado.enviados += 1;
    }
    return resultado;
  }

  /** Los docentes que recibieron un recordatorio desde `desde`. */
  private async conRecordatorioReciente(
    docentes: number[],
    idsTipo: number[],
    desde: Date,
  ): Promise<Set<number>> {
    if (idsTipo.length === 0) {
      return new Set();
    }
    const filas = await this.prisma.notificacion.findMany({
      where: {
        id_usuario: { in: docentes },
        id_tipo_notificacion: { in: idsTipo },
        created_at: { gte: desde },
      },
      select: { id_usuario: true },
      distinct: ['id_usuario'],
    });
    return new Set(
      filas
        .map((fila) => fila.id_usuario)
        .filter((id): id is number => id !== null),
    );
  }
}

/**
 * Las 0:00 de `fecha` en Colombia. La periodicidad se cuenta en días de calendario: con 7, el
 * recordatorio del jueves vuelve el jueves siguiente, aunque la revisión corra unos segundos
 * antes que la semana anterior. Colombia no tiene horario de verano: el desfase es fijo.
 */
function inicioDelDia(fecha: string): Date {
  return new Date(`${fecha}T00:00:00-05:00`);
}

/** El aviso agrupado de un docente: título, mensaje, tipo y a dónde lleva. */
export function recordatorioDe(proyectos: readonly ProyectoConPendientesDto[]) {
  const vencidas = proyectos.reduce((suma, p) => suma + p.vencidas, 0);
  const porVencer = proyectos.reduce((suma, p) => suma + p.porVencer, 0);
  const partes = [
    vencidas > 0 &&
      `${contar(vencidas, 'sesión vencida', 'sesiones vencidas')} sin diligenciar`,
    porVencer > 0 &&
      `${contar(porVencer, 'sesión por vencer', 'sesiones por vencer')}`,
  ].filter((parte): parte is string => Boolean(parte));
  const cursos = proyectos.slice(0, CURSOS_NOMBRADOS).map(nombreCurso);
  const restantes = proyectos.length - cursos.length;
  if (restantes > 0) {
    cursos.push(contar(restantes, 'curso más', 'cursos más'));
  }
  // Un curso: su calendario (HU-13-02). Varios: el inicio, donde el panel los lista todos.
  const unSoloCurso = proyectos.length === 1;
  return {
    tipo:
      vencidas > 0 ? NOTIFICACION.sesionVencida : NOTIFICACION.sesionPorVencer,
    titulo:
      vencidas > 0
        ? 'Tiene sesiones vencidas sin diligenciar'
        : 'Tiene sesiones por vencer',
    mensaje:
      `Tiene ${unir(partes)} en ${unSoloCurso ? 'el curso' : contar(proyectos.length, 'curso', 'cursos')}: ` +
      `${unir(cursos)}. Regístrelas en el calendario del curso para no acumular atrasos.`,
    entidad: 'proyecto_docente',
    // Los proyectos llegan del más atrasado al menos atrasado.
    idEntidad: proyectos[0].idProyectoDocente,
    urlDestino: unSoloCurso
      ? `/proyectos-docentes/${proyectos[0].idProyectoDocente}/calendario`
      : '/',
  };
}

function nombreCurso(proyecto: ProyectoConPendientesDto): string {
  const detalle = [
    proyecto.grupo && `grupo ${proyecto.grupo}`,
    proyecto.periodo,
  ].filter(Boolean);
  return detalle.length > 0
    ? `${proyecto.asignatura} (${detalle.join(', ')})`
    : proyecto.asignatura;
}

function contar(cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}

/** «a», «a y b», «a, b y c». */
function unir(partes: readonly string[]): string {
  return partes.length <= 1
    ? (partes[0] ?? '')
    : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}
