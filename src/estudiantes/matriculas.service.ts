import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import {
  PARAMETRO,
  ParametrosService,
} from '../common/parametros/parametros.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AlcanceService } from '../proyectos-docentes/alcance.service.js';
import type { ConsultarMatriculadosDto } from './dto/consultar-matriculados.dto.js';
import type {
  MatriculadoDto,
  PaginaMatriculadosDto,
  ResultadoCargaMatriculadosDto,
  UltimaCargaDto,
} from './dto/respuestas.dto.js';
import { ESTADO_MATRICULA, type EstadoMatricula } from './estados.js';
import {
  type EstudianteDelArchivo,
  leerListaMatriculados,
} from './lista-matriculados.js';

export const MENSAJE_PROYECTO_NO_EXISTE =
  'El proyecto docente no existe o no tiene acceso a él.';
export const MENSAJE_SIN_ARCHIVO =
  'Seleccione el archivo de Excel con la lista de estudiantes.';
export const EXTENSION_LISTA = 'xlsx';
export const MENSAJE_TIPO_ARCHIVO =
  'Cargue la lista en un archivo de Excel (.xlsx). Si la tiene en otro formato, ábrala en Excel y guárdela como «Libro de Excel».';

/** Archivo recibido por `ArchivoListaInterceptor` (multer en memoria). */
export interface ArchivoRecibido {
  originalname: string;
  buffer: Buffer;
}

/** Proyecto al que se le carga o consulta la lista, ya comprobado el acceso. */
interface ProyectoAccesible {
  id: number;
  idPrograma: number | null;
}

/**
 * Cómo queda la lista en `auditoria` (RF-29): la carga (`actualizar`, desde este servicio) y
 * la consulta (`consulta_sensible`, con `@AuditarConsulta` en el controlador) se registran
 * sobre la tabla `matricula`, con el proyecto docente como `id_registro`, porque la lista es
 * de todo el curso. En `valor_nuevo` van solo los conteos, nunca datos de los estudiantes.
 */
export const TABLA_AUDITORIA = 'matricula';

/**
 * Tiempo máximo de la transacción de carga. Menor que la espera del servidor de Next (12 s):
 * si se agota, la transacción se deshace y el usuario recibe el error, en lugar de ver «tardó
 * demasiado» mientras la carga termina por detrás.
 */
const TIEMPO_MAXIMO_CARGA_MS = 10_000;

/**
 * Lista de estudiantes matriculados por curso (RF-22, HU-09-01). Un curso es un proyecto
 * docente: asignatura, período y grupo. Mientras no exista integración con el sistema
 * académico, el archivo que carga el Administrador es el único origen de la lista (SUP-03).
 *
 * Quién accede (matriz de permisos de `URAP-34` y RF-22, «Comentarios»):
 * - Cargar: el Administrador, sobre los proyectos de su alcance (HU-09-01).
 * - Consultar: el Administrador y los docentes asignados al proyecto
 *   (`proyecto_docente_docente`). Son datos personales (Ley 1581 de 2012): ningún otro rol
 *   ve la lista individual.
 */
@Injectable()
export class MatriculasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alcance: AlcanceService,
    private readonly parametros: ParametrosService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Reemplaza la lista del curso con la del archivo. Los estudiantes que ya no aparecen
   * quedan «retirados», no se borran: sus inasistencias y valoraciones se conservan
   * (NFR-017). Todo o nada: si una fila tiene un error, no se guarda ninguna.
   */
  async cargar(
    usuario: UsuarioSesion,
    idProyecto: number,
    archivo: ArchivoRecibido | undefined,
  ): Promise<ResultadoCargaMatriculadosDto> {
    const proyecto = await this.exigirProyecto(usuario, idProyecto, 'cargar');
    if (!archivo || archivo.buffer.length === 0) {
      throw new BadRequestException(MENSAJE_SIN_ARCHIVO);
    }
    await this.exigirTipoPermitido(archivo.originalname);

    const lectura = await leerListaMatriculados(archivo.buffer);
    if (lectura.tipo === 'invalido') {
      throw new UnprocessableEntityException({
        mensaje: lectura.mensaje,
        detalles: lectura.errores,
      });
    }

    const ahora = new Date();
    const conteo = await this.prisma.$transaction(
      (tx) =>
        this.reemplazarLista(
          tx,
          proyecto,
          lectura.estudiantes,
          usuario.id,
          ahora,
        ),
      { timeout: TIEMPO_MAXIMO_CARGA_MS },
    );

    // Solo conteos: la auditoría no repite datos personales de los estudiantes.
    await this.auditoria.registrar({
      accion: 'actualizar',
      tablaAfectada: TABLA_AUDITORIA,
      idRegistro: proyecto.id,
      valorNuevo: conteo,
    });
    return {
      ...conteo,
      carga: {
        fecha: ahora.toISOString(),
        cargadoPor: nombreCompleto(usuario),
      },
    };
  }

  async listar(
    usuario: UsuarioSesion,
    idProyecto: number,
    { pagina, tamano, estado }: ConsultarMatriculadosDto,
  ): Promise<PaginaMatriculadosDto> {
    const proyecto = await this.exigirProyecto(
      usuario,
      idProyecto,
      'consultar',
    );
    const delProyecto = { id_proyecto_docente: proyecto.id };

    const [porEstado, filas, ultima] = await Promise.all([
      this.prisma.matricula.groupBy({
        by: ['estado'],
        where: delProyecto,
        _count: { _all: true },
      }),
      this.prisma.matricula.findMany({
        where: { ...delProyecto, estado },
        select: {
          id: true,
          estado: true,
          estudiante: {
            select: {
              identificacion: true,
              nombres: true,
              apellidos: true,
              email: true,
            },
          },
        },
        orderBy: [
          { estudiante: { apellidos: 'asc' } },
          { estudiante: { nombres: 'asc' } },
          { id: 'asc' },
        ],
        skip: (pagina - 1) * tamano,
        take: tamano,
      }),
      this.prisma.matricula.findFirst({
        where: { ...delProyecto, fecha_carga: { not: null } },
        orderBy: [{ fecha_carga: 'desc' }, { id: 'desc' }],
        select: {
          fecha_carga: true,
          usuario: { select: { nombres: true, apellidos: true } },
        },
      }),
    ]);

    const contar = (valor: EstadoMatricula) =>
      porEstado.find((grupo) => grupo.estado === valor)?._count._all ?? 0;

    return {
      elementos: filas.map(aMatriculado),
      pagina,
      tamano,
      total: contar(estado),
      totalMatriculados: contar(ESTADO_MATRICULA.matriculado),
      totalRetirados: contar(ESTADO_MATRICULA.retirado),
      ultimaCarga: ultima?.fecha_carga
        ? {
            fecha: ultima.fecha_carga.toISOString(),
            cargadoPor: nombreCompleto(ultima.usuario),
          }
        : null,
    };
  }

  /**
   * Comprueba el rol con su alcance, no solo el rol (matriz de `URAP-34`: «los alcances son
   * filtros»). Responde 404 igual si el proyecto no existe o si no es accesible, para no
   * revelar proyectos ajenos.
   */
  private async exigirProyecto(
    usuario: UsuarioSesion,
    idProyecto: number,
    operacion: 'cargar' | 'consultar',
  ): Promise<ProyectoAccesible> {
    const proyecto = await this.prisma.proyecto_docente.findUnique({
      where: { id: idProyecto },
      select: {
        id: true,
        asignatura: {
          select: { plan_estudio: { select: { id_programa: true } } },
        },
        proyecto_docente_docente: {
          where: { id_usuario: usuario.id },
          select: { id_usuario: true },
        },
      },
    });
    if (!proyecto) {
      throw new NotFoundException(MENSAJE_PROYECTO_NO_EXISTE);
    }
    const esAdministrador = await this.alcance.alcanzaPrograma(
      usuario.id,
      [ROL.administrador],
      proyecto.asignatura?.plan_estudio.id_programa ?? null,
    );
    const esDocenteAsignado =
      usuario.roles.includes(ROL.docente) &&
      proyecto.proyecto_docente_docente.length > 0;
    const permitido =
      operacion === 'cargar'
        ? esAdministrador
        : esAdministrador || esDocenteAsignado;
    if (!permitido) {
      throw new NotFoundException(MENSAJE_PROYECTO_NO_EXISTE);
    }
    return {
      id: proyecto.id,
      idPrograma: proyecto.asignatura?.plan_estudio.id_programa ?? null,
    };
  }

  /** NFR-019: solo Excel, y solo si la extensión está entre las permitidas del sistema. */
  private async exigirTipoPermitido(nombreArchivo: string): Promise<void> {
    const extension = nombreArchivo.split('.').pop()?.toLowerCase() ?? '';
    const permitidas = await this.parametros.lista(
      PARAMETRO.archivoTiposPermitidos,
    );
    if (extension !== EXTENSION_LISTA || !permitidas.includes(extension)) {
      throw new BadRequestException(MENSAJE_TIPO_ARCHIVO);
    }
  }

  private async reemplazarLista(
    tx: Prisma.TransactionClient,
    { id: idProyecto, idPrograma }: ProyectoAccesible,
    estudiantes: EstudianteDelArchivo[],
    idUsuario: number,
    ahora: Date,
  ): Promise<Omit<ResultadoCargaMatriculadosDto, 'carga'>> {
    // Dos cargas simultáneas sobre el mismo curso se atienden de a una.
    await tx.$queryRaw`SELECT id FROM proyecto_docente WHERE id = ${idProyecto} FOR UPDATE`;

    const documentos = estudiantes.map((estudiante) => estudiante.documento);
    const existentes = await tx.estudiante.findMany({
      where: { identificacion: { in: documentos } },
      select: {
        id: true,
        identificacion: true,
        nombres: true,
        apellidos: true,
        email: true,
      },
    });
    // MySQL compara el documento sin distinguir mayúsculas; el Map debe hacer lo mismo.
    const existentePorDocumento = new Map(
      existentes.map((estudiante) => [
        estudiante.identificacion?.toUpperCase(),
        estudiante,
      ]),
    );

    // El archivo es el origen oficial (SUP-03): corrige nombres y correo de quien ya existía.
    // Un correo vacío en el archivo no borra el que ya se tenía.
    let actualizados = 0;
    for (const fila of estudiantes) {
      const actual = existentePorDocumento.get(fila.documento);
      if (!actual) {
        continue;
      }
      const correo = fila.correo ?? actual.email;
      if (
        actual.nombres !== fila.nombres ||
        actual.apellidos !== fila.apellidos ||
        actual.email !== correo
      ) {
        await tx.estudiante.update({
          where: { id: actual.id },
          data: {
            nombres: fila.nombres,
            apellidos: fila.apellidos,
            email: correo,
          },
        });
        actualizados += 1;
      }
    }

    const sinRegistrar = estudiantes.filter(
      (fila) => !existentePorDocumento.has(fila.documento),
    );
    if (sinRegistrar.length > 0) {
      // skipDuplicates: si otra carga registró al mismo estudiante en este instante, se usa
      // ese registro en lugar de fallar por el índice único del documento.
      await tx.estudiante.createMany({
        data: sinRegistrar.map((fila) => ({
          identificacion: fila.documento,
          nombres: fila.nombres,
          apellidos: fila.apellidos,
          email: fila.correo,
          id_programa: idPrograma,
          activo: true,
        })),
        skipDuplicates: true,
      });
    }

    const idsDelArchivo = (
      await tx.estudiante.findMany({
        where: { identificacion: { in: documentos } },
        select: { id: true },
      })
    ).map((estudiante) => estudiante.id);
    const enArchivo = new Set(idsDelArchivo);

    const matriculas = await tx.matricula.findMany({
      where: { id_proyecto_docente: idProyecto },
      select: { id: true, id_estudiante: true, estado: true },
    });
    const yaMatriculados = new Set(
      matriculas.map((matricula) => matricula.id_estudiante),
    );
    const nuevas = idsDelArchivo.filter((id) => !yaMatriculados.has(id));
    const siguen = matriculas.filter(
      (matricula) =>
        matricula.id_estudiante !== null &&
        enArchivo.has(matricula.id_estudiante),
    );
    const salen = matriculas.filter(
      (matricula) =>
        (matricula.id_estudiante === null ||
          !enArchivo.has(matricula.id_estudiante)) &&
        matricula.estado !== ESTADO_MATRICULA.retirado,
    );
    const carga = { fecha_carga: ahora, id_cargado_por: idUsuario };

    if (nuevas.length > 0) {
      await tx.matricula.createMany({
        data: nuevas.map((idEstudiante) => ({
          id_proyecto_docente: idProyecto,
          id_estudiante: idEstudiante,
          estado: ESTADO_MATRICULA.matriculado,
          ...carga,
        })),
      });
    }
    if (siguen.length > 0) {
      await tx.matricula.updateMany({
        where: { id: { in: siguen.map((matricula) => matricula.id) } },
        data: { estado: ESTADO_MATRICULA.matriculado, ...carga },
      });
    }
    if (salen.length > 0) {
      await tx.matricula.updateMany({
        where: { id: { in: salen.map((matricula) => matricula.id) } },
        data: { estado: ESTADO_MATRICULA.retirado, ...carga },
      });
    }

    return {
      matriculados: estudiantes.length,
      nuevos: nuevas.length,
      reincorporados: siguen.filter(
        (matricula) => matricula.estado === ESTADO_MATRICULA.retirado,
      ).length,
      retirados: salen.length,
      actualizados,
    };
  }
}

function aMatriculado(fila: {
  id: number;
  estado: string | null;
  estudiante: {
    identificacion: string | null;
    nombres: string | null;
    apellidos: string | null;
    email: string | null;
  } | null;
}): MatriculadoDto {
  return {
    idMatricula: fila.id,
    documento: fila.estudiante?.identificacion ?? '',
    nombres: fila.estudiante?.nombres ?? '',
    apellidos: fila.estudiante?.apellidos ?? '',
    correo: fila.estudiante?.email ?? null,
    estado:
      fila.estado === ESTADO_MATRICULA.retirado
        ? ESTADO_MATRICULA.retirado
        : ESTADO_MATRICULA.matriculado,
  };
}

function nombreCompleto(
  persona: { nombres: string | null; apellidos: string | null } | null,
): UltimaCargaDto['cargadoPor'] {
  return (
    [persona?.nombres, persona?.apellidos].filter(Boolean).join(' ') ||
    'Usuario sin nombre'
  );
}
