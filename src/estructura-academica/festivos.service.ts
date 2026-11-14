import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { dia_festivo } from '../generated/prisma/client.js';
import { soloCambios } from '../proyectos-docentes/edicion-proyecto.service.js';
import { aFechaColumna, aTextoFecha } from '../sesiones/calendario.js';
import { SesionesService } from '../sesiones/sesiones.service.js';
import type {
  CrearFestivoDto,
  EditarFestivoDto,
  FestivoDto,
  ListaFestivosDto,
  ResultadoCargaLeyDto,
  ResultadoFestivoDto,
} from './dto/festivos.dto.js';
import { festivosDeLey } from './festivos-ley.js';

export const TABLA_FESTIVOS = 'dia_festivo';
export const MENSAJE_FESTIVO_NO_EXISTE =
  'El día sin clase no existe o ya fue eliminado.';

export function mensajeFechaOcupada(
  fecha: string,
  nombre: string | null,
): string {
  return `El ${fecha} ya está en la tabla como «${nombre ?? 'día sin clase'}». Edítelo en lugar de agregarlo otra vez.`;
}

export function mensajeConfirmarEliminar(sesiones: number): string {
  return (
    `Este día marca ${sesiones === 1 ? '1 sesión' : `${sesiones} sesiones`} de los calendarios. ` +
    'Si lo quita, las que no se han diligenciado vuelven a ser de clase. Confirme para eliminarlo.'
  );
}

type FestivoConConteo = dia_festivo & { _count: { sesion_clase: number } };

function aFestivo(festivo: FestivoConConteo): FestivoDto {
  return {
    id: festivo.id,
    fecha: festivo.fecha ? aTextoFecha(festivo.fecha) : '',
    nombre: festivo.nombre ?? '',
    origen: festivo.origen,
    sesiones: festivo._count.sesion_clase,
  };
}

const CON_CONTEO = { _count: { select: { sesion_clase: true } } } as const;

/** Lo que se audita de un día sin clase: sus datos de negocio, sin el id ni la fecha de alta. */
function camposAuditados(festivo: dia_festivo) {
  return {
    fecha: festivo.fecha ? aTextoFecha(festivo.fecha) : null,
    nombre: festivo.nombre,
    origen: festivo.origen,
  };
}

/**
 * HU-08-01 (RF-19): la tabla de días sin clase por año, que el calendario usa para marcar los
 * festivos (RF-19, p3 y p4) y reconocer el receso. Solo la administra el administrador
 * (matriz de permisos, «Estructura académica»).
 *
 * Cada cambio recalcula los calendarios ya generados de los períodos abiertos que tocan la
 * fecha (RF-19, excepción p5), sin tocar las sesiones que el docente ya diligenció. El
 * recálculo va después de confirmar el cambio: si un calendario falla, el cambio se conserva y
 * el fallo queda en el registro técnico.
 */
@Injectable()
export class FestivosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly sesiones: SesionesService,
  ) {}

  async listar(anio: number): Promise<ListaFestivosDto> {
    const festivos = await this.prisma.dia_festivo.findMany({
      where: { fecha: this.delAnio(anio) },
      include: CON_CONTEO,
      orderBy: { fecha: 'asc' },
    });
    const deLey = festivosDeLey(anio);
    const presentes = new Set(
      festivos.map((festivo) => festivo.fecha && aTextoFecha(festivo.fecha)),
    );
    return {
      anio,
      elementos: festivos.map(aFestivo),
      festivosDeLey: deLey.length,
      faltantesDeLey: deLey.filter((festivo) => !presentes.has(festivo.fecha))
        .length,
    };
  }

  async crear(datos: CrearFestivoDto): Promise<ResultadoFestivoDto> {
    const fecha = aFechaColumna(datos.fecha);
    await this.exigirFechaLibre(fecha, null);
    const creado = await this.prisma.dia_festivo.create({
      data: {
        fecha,
        nombre: datos.nombre,
        anio: fecha.getUTCFullYear(),
        origen: datos.origen ?? 'institucional',
      },
      include: CON_CONTEO,
    });
    await this.auditoria.registrar({
      accion: 'crear',
      tablaAfectada: TABLA_FESTIVOS,
      idRegistro: creado.id,
      valorNuevo: camposAuditados(creado),
    });
    const calendariosRecalculados = await this.sesiones.recalcularPorFestivos([
      fecha,
    ]);
    return {
      festivo: aFestivo(await this.buscar(creado.id)),
      calendariosRecalculados,
    };
  }

  async editar(
    id: number,
    datos: EditarFestivoDto,
  ): Promise<ResultadoFestivoDto> {
    const anterior = await this.buscar(id);
    const fecha = datos.fecha ? aFechaColumna(datos.fecha) : anterior.fecha;
    const cambiaFecha =
      fecha !== null &&
      anterior.fecha !== null &&
      fecha.getTime() !== anterior.fecha.getTime();
    if (cambiaFecha) {
      await this.exigirFechaLibre(fecha, id);
    }
    const nuevo = await this.prisma.$transaction(async (tx) => {
      if (cambiaFecha) {
        // Las sesiones marcadas por la fecha vieja dejan de serlo; el recálculo marca las de la
        // nueva. Las diligenciadas conservan su tipo.
        await tx.sesion_clase.updateMany({
          where: { id_dia_festivo: id },
          data: { id_dia_festivo: null },
        });
      }
      return tx.dia_festivo.update({
        where: { id },
        data: {
          ...(cambiaFecha && fecha
            ? { fecha, anio: fecha.getUTCFullYear() }
            : {}),
          ...(datos.nombre !== undefined ? { nombre: datos.nombre } : {}),
          ...(datos.origen !== undefined ? { origen: datos.origen } : {}),
        },
      });
    });
    const cambios = soloCambios(
      camposAuditados(anterior),
      camposAuditados(nuevo),
    );
    if (cambios) {
      await this.auditoria.registrar({
        accion: 'actualizar',
        tablaAfectada: TABLA_FESTIVOS,
        idRegistro: id,
        valorAnterior: cambios.anterior,
        valorNuevo: cambios.nuevo,
      });
    }
    const calendariosRecalculados =
      cambiaFecha && anterior.fecha && fecha
        ? await this.sesiones.recalcularPorFestivos([anterior.fecha, fecha])
        : 0;
    return {
      festivo: aFestivo(await this.buscar(id)),
      calendariosRecalculados,
    };
  }

  async eliminar(id: number, confirmar: boolean): Promise<ResultadoFestivoDto> {
    const anterior = await this.buscar(id);
    if (anterior._count.sesion_clase > 0 && !confirmar) {
      throw new ConflictException(
        mensajeConfirmarEliminar(anterior._count.sesion_clase),
      );
    }
    await this.prisma.$transaction([
      this.prisma.sesion_clase.updateMany({
        where: { id_dia_festivo: id },
        data: { id_dia_festivo: null },
      }),
      this.prisma.dia_festivo.delete({ where: { id } }),
    ]);
    await this.auditoria.registrar({
      accion: 'eliminar',
      tablaAfectada: TABLA_FESTIVOS,
      idRegistro: id,
      valorAnterior: camposAuditados(anterior),
    });
    const calendariosRecalculados = anterior.fecha
      ? await this.sesiones.recalcularPorFestivos([anterior.fecha])
      : 0;
    return { festivo: null, calendariosRecalculados };
  }

  /**
   * Carga los festivos de ley del año (Ley 51 de 1983). Las fechas que ya están en la tabla se
   * conservan como están: el administrador pudo haberlas corregido.
   */
  async cargarLey(anio: number): Promise<ResultadoCargaLeyDto> {
    const deLey = festivosDeLey(anio);
    const existentes = new Set(
      (
        await this.prisma.dia_festivo.findMany({
          where: { fecha: this.delAnio(anio) },
          select: { fecha: true },
        })
      ).map((festivo) => festivo.fecha && aTextoFecha(festivo.fecha)),
    );
    const nuevos = deLey.filter((festivo) => !existentes.has(festivo.fecha));
    const creados = await this.prisma.$transaction(
      nuevos.map((festivo) =>
        this.prisma.dia_festivo.create({
          data: {
            fecha: aFechaColumna(festivo.fecha),
            nombre: festivo.nombre,
            anio,
            origen: 'ley',
          },
        }),
      ),
    );
    for (const creado of creados) {
      await this.auditoria.registrar({
        accion: 'crear',
        tablaAfectada: TABLA_FESTIVOS,
        idRegistro: creado.id,
        valorNuevo: camposAuditados(creado),
      });
    }
    const calendariosRecalculados = await this.sesiones.recalcularPorFestivos(
      creados.flatMap((creado) => (creado.fecha ? [creado.fecha] : [])),
    );
    return {
      anio,
      creados: creados.length,
      existentes: deLey.length - nuevos.length,
      calendariosRecalculados,
    };
  }

  private delAnio(anio: number) {
    return {
      gte: aFechaColumna(`${anio}-01-01`),
      lte: aFechaColumna(`${anio}-12-31`),
    };
  }

  private async buscar(id: number): Promise<FestivoConConteo> {
    const festivo = await this.prisma.dia_festivo.findUnique({
      where: { id },
      include: CON_CONTEO,
    });
    if (!festivo) {
      throw new NotFoundException(MENSAJE_FESTIVO_NO_EXISTE);
    }
    return festivo;
  }

  private async exigirFechaLibre(fecha: Date, idPropio: number | null) {
    const ocupada = await this.prisma.dia_festivo.findUnique({
      where: { fecha },
    });
    if (ocupada && ocupada.id !== idPropio) {
      throw new ConflictException(
        mensajeFechaOcupada(aTextoFecha(fecha), ocupada.nombre),
      );
    }
  }
}
