import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
import {
  MENSAJE_PROYECTO_NO_EXISTE,
  ProyectosDocentesService,
} from '../proyectos-docentes/proyectos-docentes.service.js';
import {
  ALMACENAMIENTO_DOCUMENTAL,
  type AlmacenamientoDocumental,
  type ArchivoAbierto,
  ArchivoNoEncontrado,
} from './almacenamiento/almacenamiento-documental.js';
import { MAXIMO_ARCHIVOS_POR_CARGA } from './limites-carga.js';
import type { CargarEvidenciasDto } from './dto/cargar-evidencias.dto.js';
import type { ConsultarEvidenciasDto } from './dto/consultar-evidencias.dto.js';
import type {
  CargaEvidenciasDto,
  EvidenciaDto,
  OpcionesEvidenciasDto,
  PaginaEvidenciasDto,
  SesionEvidenciaDto,
} from './dto/respuestas.dto.js';
import {
  enumerarTipos,
  reconocerTipo,
  type TipoArchivo,
  tiposDeLaLista,
} from './tipos-archivo.js';

export const MENSAJE_SOLO_DOCENTES_DEL_PROYECTO =
  'Solo los docentes asignados a este proyecto docente pueden cargar sus evidencias.';
export const MENSAJE_SIN_RAP_A_CARGO =
  'Solo puede consultar las evidencias de los RAP a su cargo, y este proyecto docente no tiene ninguno.';
export const MENSAJE_PERIODO_CERRADO =
  'El período académico del proyecto ya está cerrado: no se pueden cargar más evidencias.';
export const MENSAJE_PROYECTO_SIN_RAP =
  'El proyecto docente no tiene RAP asociados: no hay a qué asociar la evidencia.';
export const MENSAJE_RAP_AJENO =
  'El RAP seleccionado no está asociado a este proyecto docente.';
export const MENSAJE_SESION_AJENA =
  'La sesión seleccionada no pertenece al calendario de este proyecto docente.';
export const MENSAJE_FECHA_FUTURA =
  'La fecha de la evidencia no puede ser posterior a hoy.';
export const MENSAJE_SIN_ARCHIVOS = 'Seleccione al menos un archivo.';
export const MENSAJE_FALLA_ALMACENAMIENTO =
  'No se pudo guardar la evidencia en el almacenamiento de documentos. Vuelva a intentarlo en unos minutos.';
export const MENSAJE_FALLA_LECTURA =
  'No se pudo leer el archivo de la evidencia. Vuelva a intentarlo en unos minutos.';
export const MENSAJE_EVIDENCIA_NO_EXISTE =
  'La evidencia no existe o no tiene acceso a ella.';
export const MENSAJE_ARCHIVO_NO_DISPONIBLE =
  'El archivo de esta evidencia ya no está disponible.';

export function mensajeTipoNoPermitido(
  nombre: string,
  tipos: readonly TipoArchivo[],
): string {
  return `El archivo «${nombre}» no es de un tipo permitido. Puede cargar archivos ${enumerarTipos(tipos)}.`;
}

/** Matriz de permisos, «Documentos»: consultan todas las evidencias del programa (C). */
const ROLES_CONSULTA_PROGRAMA = [
  ROL.administrador,
  ROL.departamento,
  ROL.direccion,
] as const;

/**
 * Sesiones del calendario que siguen vigentes. RF-19 retira las sesiones con
 * `estado = 'retirada'` en vez de borrarlas; cuando su PR esté en `main`, esto puede usar
 * `SESION_VIGENTE` de `sesiones.service.ts`.
 */
const SESION_VIGENTE = {
  OR: [{ estado: null }, { estado: { not: 'retirada' } }],
} as const satisfies Prisma.sesion_claseWhereInput;

const ZONA_HORARIA = 'America/Bogota';

const INCLUIR_EVIDENCIA = {
  sesion_clase: { select: { id: true, fecha: true, semana: true } },
  usuario: { select: { id: true, nombres: true, apellidos: true } },
} as const satisfies Prisma.evidencia_rapInclude;

type EvidenciaConRelaciones = Prisma.evidencia_rapGetPayload<{
  include: typeof INCLUIR_EVIDENCIA;
}>;

/** Lo que el usuario puede hacer con las evidencias de un proyecto que ve. */
interface Acceso {
  idProyecto: number;
  periodoCerrado: boolean;
  /** RAP del proyecto, ordenados por número. */
  raps: Prisma.rapGetPayload<object>[];
  /** Es uno de los docentes del proyecto (`proyecto_docente_docente`): carga y ve todas. */
  esDocenteDelProyecto: boolean;
  /** RAP del proyecto cuyas evidencias puede ver. */
  rapsConsultables: number[];
}

/** Metadatos de la evidencia que se va a descargar. */
export interface ArchivoEvidencia {
  id: number;
  clave: string;
  nombreOriginal: string;
  tipo: string;
  tamanoBytes: number;
}

/**
 * RF-24: evidencias fotográficas por RAP (HU-10-01). El archivo va al almacenamiento
 * documental y la base guarda solo su referencia (`evidencia_rap.url` es la clave en el
 * almacenamiento, no una dirección pública).
 *
 * Alcance (matriz de permisos, módulo «Documentos»): el Docente registra y ve las de sus
 * proyectos (`proyecto_docente_docente`); el Líder RAP ve las de los RAP que lidera
 * (`lider_rap`); el Departamento, la Dirección y el Administrador consultan las de su
 * programa. Un usuario con varios roles tiene la unión. Las fotos de clase son datos
 * personales (Ley 1581, NFR-020): nunca se publican y cada descarga queda en la auditoría.
 */
@Injectable()
export class EvidenciasService {
  private readonly logger = new Logger(EvidenciasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alcance: AlcanceService,
    private readonly proyectos: ProyectosDocentesService,
    private readonly parametros: ParametrosService,
    private readonly auditoria: AuditoriaService,
    @Inject(ALMACENAMIENTO_DOCUMENTAL)
    private readonly almacenamiento: AlmacenamientoDocumental,
  ) {}

  /** Lo que la pantalla necesita para cargar y consultar (p1, p2). */
  async opciones(
    usuario: UsuarioSesion,
    idProyecto: number,
  ): Promise<OpcionesEvidenciasDto> {
    const acceso = await this.acceso(usuario, idProyecto);
    const motivoSinCarga = !acceso.esDocenteDelProyecto
      ? null
      : acceso.periodoCerrado
        ? MENSAJE_PERIODO_CERRADO
        : acceso.raps.length === 0
          ? MENSAJE_PROYECTO_SIN_RAP
          : null;
    const puedeCargar = acceso.esDocenteDelProyecto && motivoSinCarga === null;

    const [tamanoMaximoMb, tipos, conteos, sesiones] = await Promise.all([
      this.parametros.enteroPositivo(PARAMETRO.archivoTamanoMaximoMb),
      this.tiposPermitidos(),
      this.prisma.evidencia_rap.groupBy({
        by: ['id_rap'],
        where: {
          id_proyecto_docente: idProyecto,
          id_rap: { in: acceso.rapsConsultables },
        },
        _count: { _all: true },
      }),
      puedeCargar
        ? this.prisma.sesion_clase.findMany({
            where: { id_proyecto_docente: idProyecto, ...SESION_VIGENTE },
            select: { id: true, fecha: true, semana: true },
            orderBy: { fecha: 'asc' },
          })
        : Promise.resolve([]),
    ]);
    const totalPorRap = new Map(
      conteos.map((fila) => [fila.id_rap, fila._count._all]),
    );

    return {
      idProyectoDocente: idProyecto,
      puedeCargar,
      motivoSinCarga,
      raps: acceso.raps
        .filter((rap) => acceso.rapsConsultables.includes(rap.id))
        .map((rap) => ({
          id: rap.id,
          numero: rap.numero,
          codigo: rap.codigo,
          descripcion: rap.descripcion,
          totalEvidencias: totalPorRap.get(rap.id) ?? 0,
        })),
      sesiones: sesiones.flatMap((sesion) =>
        sesion.fecha ? [aSesion({ ...sesion, fecha: sesion.fecha })] : [],
      ),
      tamanoMaximoMb,
      extensionesPermitidas: tipos.flatMap((tipo) => [
        tipo.extension,
        ...tipo.alias,
      ]),
      tiposMimePermitidos: tipos.map((tipo) => tipo.mime),
      maximoArchivosPorCarga: MAXIMO_ARCHIVOS_POR_CARGA,
    };
  }

  /** p6: galería de evidencias, las más recientes primero. */
  async listar(
    usuario: UsuarioSesion,
    idProyecto: number,
    { pagina, tamano, idRap }: ConsultarEvidenciasDto,
  ): Promise<PaginaEvidenciasDto> {
    const acceso = await this.acceso(usuario, idProyecto);
    const raps =
      idRap === undefined
        ? acceso.rapsConsultables
        : acceso.rapsConsultables.filter((id) => id === idRap);
    const donde: Prisma.evidencia_rapWhereInput = {
      id_proyecto_docente: idProyecto,
      id_rap: { in: raps },
    };
    const [total, filas] = await Promise.all([
      this.prisma.evidencia_rap.count({ where: donde }),
      this.prisma.evidencia_rap.findMany({
        where: donde,
        include: INCLUIR_EVIDENCIA,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip: (pagina - 1) * tamano,
        take: tamano,
      }),
    ]);
    return { elementos: filas.map(aEvidencia), pagina, tamano, total };
  }

  /**
   * p3 a p5: valida y guarda una carga de uno o varios archivos con la misma descripción,
   * fecha y sesión. Es todo o nada: si un archivo no pasa, no se guarda ninguno.
   */
  async cargar(
    usuario: UsuarioSesion,
    idProyecto: number,
    datos: CargarEvidenciasDto,
    archivos: readonly Express.Multer.File[],
  ): Promise<CargaEvidenciasDto> {
    const acceso = await this.exigirPermisoDeCarga(usuario, idProyecto);
    if (!acceso.raps.some((rap) => rap.id === datos.idRap)) {
      throw new BadRequestException(MENSAJE_RAP_AJENO);
    }
    if (datos.fecha > hoyEnColombia()) {
      throw new BadRequestException(MENSAJE_FECHA_FUTURA);
    }
    if (datos.idSesion !== undefined) {
      const sesion = await this.prisma.sesion_clase.findFirst({
        where: {
          id: datos.idSesion,
          id_proyecto_docente: idProyecto,
          ...SESION_VIGENTE,
        },
        select: { id: true },
      });
      if (!sesion) {
        throw new BadRequestException(MENSAJE_SESION_AJENA);
      }
    }
    if (archivos.length === 0) {
      throw new BadRequestException(MENSAJE_SIN_ARCHIVOS);
    }

    // p4: el tipo se decide por el contenido de cada archivo, no por su nombre.
    const permitidos = await this.tiposPermitidos();
    const porGuardar = archivos.map((archivo) => {
      const nombre = limpiarNombre(archivo.originalname);
      const tipo = reconocerTipo(nombre, archivo.buffer, permitidos);
      if (!tipo) {
        throw new UnsupportedMediaTypeException(
          mensajeTipoNoPermitido(nombre, permitidos),
        );
      }
      return {
        nombre: conExtension(nombre, tipo),
        tipo,
        contenido: archivo.buffer,
        clave: `evidencias/proyecto-${idProyecto}/${randomUUID()}.${tipo.extension}`,
      };
    });

    // p5: primero el almacenamiento y después la base. Si algo falla, se borra lo que alcanzó
    // a guardarse y no queda ninguna referencia a un archivo inexistente.
    const guardados: string[] = [];
    try {
      for (const archivo of porGuardar) {
        await this.almacenamiento.guardar(archivo.clave, archivo.contenido);
        guardados.push(archivo.clave);
      }
    } catch (error) {
      this.logger.error(
        `No se pudo guardar una evidencia del proyecto docente ${idProyecto} en el almacenamiento.`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.descartar(guardados);
      throw new ServiceUnavailableException(MENSAJE_FALLA_ALMACENAMIENTO);
    }

    const ahora = new Date();
    let creadas: EvidenciaConRelaciones[];
    try {
      creadas = await this.prisma.$transaction(async (tx) => {
        const filas: EvidenciaConRelaciones[] = [];
        // Una tras otra: una transacción interactiva usa una sola conexión.
        for (const archivo of porGuardar) {
          filas.push(
            await tx.evidencia_rap.create({
              data: {
                id_proyecto_docente: idProyecto,
                id_rap: datos.idRap,
                id_sesion: datos.idSesion ?? null,
                nombre_original: archivo.nombre,
                url: archivo.clave,
                tipo: archivo.tipo.mime,
                tamano_bytes: archivo.contenido.length,
                descripcion: datos.descripcion,
                fecha: fechaDeColumnaDate(datos.fecha),
                id_subido_por: usuario.id,
                fecha_subida: ahora,
              },
              include: INCLUIR_EVIDENCIA,
            }),
          );
        }
        return filas;
      });
    } catch (error) {
      await this.descartar(guardados);
      throw error;
    }

    for (const evidencia of creadas) {
      await this.auditoria.registrar({
        accion: 'crear',
        tablaAfectada: 'evidencia_rap',
        idRegistro: evidencia.id,
        valorNuevo: {
          idProyectoDocente: idProyecto,
          idRap: evidencia.id_rap,
          idSesion: evidencia.id_sesion,
          nombreOriginal: evidencia.nombre_original,
          tipo: evidencia.tipo,
          tamanoBytes: evidencia.tamano_bytes,
          clave: evidencia.url,
        },
      });
    }
    return { evidencias: creadas.map(aEvidencia) };
  }

  /**
   * Que el usuario pueda cargar en el proyecto: lo ve (si no, 404), es uno de sus docentes, el
   * período no está cerrado y el proyecto tiene RAP. El interceptor lo comprueba antes de
   * recibir los archivos y `cargar` lo vuelve a comprobar.
   */
  async exigirPermisoDeCarga(
    usuario: UsuarioSesion,
    idProyecto: number,
  ): Promise<Acceso> {
    const acceso = await this.acceso(usuario, idProyecto);
    if (!acceso.esDocenteDelProyecto) {
      throw new ForbiddenException(MENSAJE_SOLO_DOCENTES_DEL_PROYECTO);
    }
    if (acceso.periodoCerrado) {
      throw new ConflictException(MENSAJE_PERIODO_CERRADO);
    }
    if (acceso.raps.length === 0) {
      throw new ConflictException(MENSAJE_PROYECTO_SIN_RAP);
    }
    return acceso;
  }

  /** Evidencia que el usuario puede descargar. No abre el archivo ni audita. */
  async evidenciaParaDescarga(
    usuario: UsuarioSesion,
    idProyecto: number,
    idEvidencia: number,
  ): Promise<ArchivoEvidencia> {
    const acceso = await this.acceso(usuario, idProyecto);
    const evidencia = await this.prisma.evidencia_rap.findFirst({
      where: {
        id: idEvidencia,
        id_proyecto_docente: idProyecto,
        id_rap: { in: acceso.rapsConsultables },
      },
      select: {
        id: true,
        url: true,
        nombre_original: true,
        tipo: true,
        tamano_bytes: true,
      },
    });
    if (!evidencia?.url || !evidencia.tipo) {
      throw new NotFoundException(MENSAJE_EVIDENCIA_NO_EXISTE);
    }
    return {
      id: evidencia.id,
      clave: evidencia.url,
      nombreOriginal: evidencia.nombre_original ?? `evidencia-${evidencia.id}`,
      tipo: evidencia.tipo,
      tamanoBytes: evidencia.tamano_bytes ?? 0,
    };
  }

  /**
   * Abre el archivo de una evidencia ya autorizada por `evidenciaParaDescarga`. La consulta la
   * registra el controlador: son datos personales (NFR-020).
   */
  async abrirArchivo(
    usuario: UsuarioSesion,
    evidencia: ArchivoEvidencia,
  ): Promise<ArchivoAbierto> {
    let archivo: ArchivoAbierto;
    try {
      archivo = await this.almacenamiento.abrir(evidencia.clave);
    } catch (error) {
      if (error instanceof ArchivoNoEncontrado) {
        this.logger.error(
          `La evidencia ${evidencia.id} apunta a un archivo que no existe: ${error.message}`,
        );
        throw new NotFoundException(MENSAJE_ARCHIVO_NO_DISPONIBLE);
      }
      this.logger.error(
        `No se pudo leer el archivo de la evidencia ${evidencia.id}.`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException(MENSAJE_FALLA_LECTURA);
    }
    // La descarga la audita @AuditarConsulta en el controlador, con usuario e IP (RF-29).
    return archivo;
  }

  /**
   * Proyecto que el usuario ve (mismo criterio que la bandeja; si no lo ve, 404) y lo que
   * puede hacer con sus evidencias. Quien ve el proyecto pero no puede ver ninguna de sus
   * evidencias (un Líder RAP sin RAP a cargo en él) recibe 403.
   */
  private async acceso(
    usuario: UsuarioSesion,
    idProyecto: number,
  ): Promise<Acceso> {
    const visibles = await this.proyectos.filtroVisibilidad(usuario);
    const proyecto = visibles
      ? await this.prisma.proyecto_docente.findFirst({
          where: { AND: [{ id: idProyecto }, visibles] },
          select: {
            id: true,
            id_periodo: true,
            asignatura: { select: { id_programa: true } },
            periodo_academico: { select: { cerrado: true } },
            proyecto_docente_rap: {
              select: { rap: true },
              orderBy: { rap: { numero: 'asc' } },
            },
            proyecto_docente_docente: {
              where: { id_usuario: usuario.id },
              select: { id_usuario: true },
            },
          },
        })
      : null;
    if (!proyecto) {
      throw new NotFoundException(MENSAJE_PROYECTO_NO_EXISTE);
    }

    const raps = proyecto.proyecto_docente_rap.map((fila) => fila.rap);
    const idsRap = raps.map((rap) => rap.id);
    const esDocenteDelProyecto =
      usuario.roles.includes(ROL.docente) &&
      proyecto.proyecto_docente_docente.length > 0;
    const base = {
      idProyecto: proyecto.id,
      periodoCerrado: proyecto.periodo_academico?.cerrado === true,
      raps,
      esDocenteDelProyecto,
    };

    if (
      esDocenteDelProyecto ||
      (await this.alcance.alcanzaPrograma(
        usuario.id,
        ROLES_CONSULTA_PROGRAMA,
        proyecto.asignatura?.id_programa ?? null,
      ))
    ) {
      return { ...base, rapsConsultables: idsRap };
    }

    // «C autorizados» del Líder RAP: los RAP que lidera en el período del proyecto.
    const liderados = usuario.roles.includes(ROL.liderRap)
      ? await this.prisma.lider_rap.findMany({
          where: {
            id_usuario: usuario.id,
            activo: true,
            id_rap: { in: idsRap },
            OR: [{ id_periodo: proyecto.id_periodo }, { id_periodo: null }],
          },
          select: { id_rap: true },
        })
      : [];
    const rapsConsultables = idsRap.filter((id) =>
      liderados.some((fila) => fila.id_rap === id),
    );
    if (rapsConsultables.length === 0) {
      throw new ForbiddenException(MENSAJE_SIN_RAP_A_CARGO);
    }
    return { ...base, rapsConsultables };
  }

  /** Tipos de `evidencia_tipos_permitidos` que el backend sabe reconocer. */
  private async tiposPermitidos(): Promise<TipoArchivo[]> {
    const lista = await this.parametros.lista(
      PARAMETRO.evidenciaTiposPermitidos,
    );
    const { tipos, desconocidas } = tiposDeLaLista(lista);
    if (desconocidas.length > 0) {
      this.logger.warn(
        `El parámetro «${PARAMETRO.evidenciaTiposPermitidos}» trae tipos que no se saben reconocer y se ignoran: ${desconocidas.join(', ')}.`,
      );
    }
    if (tipos.length === 0) {
      this.logger.error(
        `El parámetro «${PARAMETRO.evidenciaTiposPermitidos}» no trae ningún tipo reconocible.`,
      );
      throw new InternalServerErrorException();
    }
    return tipos;
  }

  /** Borra los archivos de una carga que no se completó. Si falla, queda en el registro. */
  private async descartar(claves: readonly string[]): Promise<void> {
    for (const clave of claves) {
      try {
        await this.almacenamiento.eliminar(clave);
      } catch (error) {
        this.logger.error(
          `No se pudo borrar el archivo huérfano «${clave}» del almacenamiento.`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}

function aEvidencia(evidencia: EvidenciaConRelaciones): EvidenciaDto {
  const sesion = evidencia.sesion_clase;
  return {
    id: evidencia.id,
    idProyectoDocente: evidencia.id_proyecto_docente ?? 0,
    idRap: evidencia.id_rap ?? 0,
    sesion: sesion?.fecha ? aSesion({ ...sesion, fecha: sesion.fecha }) : null,
    descripcion: evidencia.descripcion ?? '',
    fecha: evidencia.fecha ? textoDeColumnaDate(evidencia.fecha) : '',
    nombreOriginal: evidencia.nombre_original ?? `evidencia-${evidencia.id}`,
    tipo: evidencia.tipo ?? 'application/octet-stream',
    tamanoBytes: evidencia.tamano_bytes ?? 0,
    fechaSubida: (evidencia.fecha_subida ?? new Date(0)).toISOString(),
    subidoPor: evidencia.usuario
      ? {
          id: evidencia.usuario.id,
          nombres: evidencia.usuario.nombres,
          apellidos: evidencia.usuario.apellidos,
        }
      : null,
  };
}

function aSesion(sesion: {
  id: number;
  fecha: Date;
  semana: number | null;
}): SesionEvidenciaDto {
  return {
    id: sesion.id,
    fecha: textoDeColumnaDate(sesion.fecha),
    semana: sesion.semana,
  };
}

/** Fecha de hoy en Colombia (AAAA-MM-DD), que es la que ve el docente. */
export function hoyEnColombia(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

/** Fecha de una columna DATE: la medianoche UTC del día, para que no cambie de día. */
function fechaDeColumnaDate(texto: string): Date {
  return new Date(`${texto}T00:00:00.000Z`);
}

function textoDeColumnaDate(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** Nombre seguro para guardar y mostrar: sin carpetas ni caracteres de control. */
export function limpiarNombre(original: string): string {
  const base = original.split(/[\\/]/).at(-1) ?? '';
  // oxlint-disable-next-line no-control-regex -- se quitan justamente los caracteres de control.
  return base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
}

/**
 * Nombre con la extensión de su tipo y dentro de los 255 caracteres de la columna. Un nombre
 * vacío o sin extensión la recibe, para que el archivo descargado se abra con el programa
 * correcto.
 */
export function conExtension(nombre: string, tipo: TipoArchivo): string {
  const conocida = [tipo.extension, ...tipo.alias].some((extension) =>
    nombre.toLowerCase().endsWith(`.${extension}`),
  );
  const base = nombre === '' ? 'evidencia' : nombre;
  const extension = conocida ? '' : `.${tipo.extension}`;
  const maximo = 255 - extension.length;
  if (base.length <= maximo) {
    return `${base}${extension}`;
  }
  // Se recorta el principio y se conserva el final, donde está la extensión.
  return `${base.slice(base.length - maximo)}${extension}`;
}
