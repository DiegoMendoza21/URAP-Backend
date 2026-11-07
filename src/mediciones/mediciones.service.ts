import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { ESTADO_MATRICULA } from '../estudiantes/estados.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AlcanceService } from '../proyectos-docentes/alcance.service.js';
import {
  ESTADO_MEDICION,
  ESTADO_RUBRICA_VIGENTE,
  type EstadoMedicion,
  ESTADOS_PROYECTO_APROBADO,
  MENSAJE_CELDA_REPETIDA,
  MENSAJE_ESTUDIANTE_NO_DEL_CURSO,
  MENSAJE_FALTAN_ACCIONES_PROPUESTAS,
  MENSAJE_INDICADOR_NO_DE_MEDICION,
  MENSAJE_MEDICION_CERRADA,
  MENSAJE_MEDICION_EXISTENTE,
  MENSAJE_MEDICION_NO_CERRADA,
  MENSAJE_MEDICION_NO_EXISTE,
  MENSAJE_NIVEL_INVALIDO,
  MENSAJE_PERIODO_CERRADO,
  MENSAJE_PROYECTO_NO_APROBADO,
  MENSAJE_PROYECTO_NO_EXISTE,
  MENSAJE_RAP_NO_DEL_PROYECTO,
  MENSAJE_SIN_ESCALA,
  MENSAJE_SIN_LISTA,
  MENSAJE_SIN_RUBRICA,
  MENSAJE_SIN_VALORACIONES,
  MENSAJE_SOLO_DEPARTAMENTO_REABRE,
  MENSAJE_SOLO_DOCENTE_ASIGNADO,
  MENSAJE_SOLO_DOCENTE_O_LIDER,
  PERIODO_TOMA,
  type PeriodoToma,
  TIPO_VALORACION,
  type TipoValoracion,
} from './constantes.js';
import {
  type Consolidado,
  consolidar,
  contarPorIndicador,
  nivelesDeEscala,
} from './consolidado.js';
import { ConsolidadoService } from './consolidado.service.js';
import type {
  ConsultarMedicionesDto,
  IniciarMedicionDto,
  RegistrarAnalisisDto,
  RegistrarInstrumentosDto,
  RegistrarValoracionesDto,
} from './dto/entradas.dto.js';
import type {
  ConsolidadoDto,
  EscalaMedicionDto,
  EstudianteMedicionDto,
  IndicadorMedicionDto,
  MedicionDetalleDto,
  MedicionesDelProyectoDto,
  MedicionResumenDto,
  PaginaMedicionesDto,
  PeriodoTomaSugeridoDto,
  ProyectoMedicionDto,
  RapMedicionDto,
  ResultadoValoracionesDto,
} from './dto/respuestas.dto.js';

/**
 * Tiempo máximo de un guardado de valoraciones (RF-30, q2: 10 s). Menor que la espera del
 * servidor de Next, para que el usuario reciba el error en lugar de «tardó demasiado».
 */
const TIEMPO_MAXIMO_GUARDADO_MS = 10_000;

/** Lo que hace falta leer del proyecto para decidir el acceso y armar la cabecera. */
const SELECCION_PROYECTO = {
  id: true,
  grupo: true,
  id_periodo: true,
  asignatura: { select: { nombre: true, id_programa: true } },
  periodo_academico: { select: { codigo: true, cerrado: true } },
  estado_proyecto: { select: { codigo: true, nombre: true } },
  proyecto_docente_rap: {
    select: {
      id_rap: true,
      id_rubrica: true,
      rap: {
        select: { id: true, codigo: true, numero: true, descripcion: true },
      },
    },
    orderBy: { rap: { numero: 'asc' } },
  },
} satisfies Prisma.proyecto_docenteSelect;

type ProyectoLeido = Prisma.proyecto_docenteGetPayload<{
  select: typeof SELECCION_PROYECTO;
}>;

/**
 * Qué puede hacer un usuario con las mediciones de un curso. La matriz de permisos
 * (`URAP-34`) da alcances, no solo roles: el Docente registra en los cursos que tiene
 * asignados (`proyecto_docente_docente`), el Líder RAP consulta los RAP que lidera
 * (`lider_rap`) y el Departamento consulta los cursos de su programa. Las valoraciones son
 * datos personales: RF-30 («Comentarios») y NFR-020 limitan su consulta a esos tres.
 */
interface Acceso {
  docenteAsignado: boolean;
  departamento: boolean;
  rapsLiderados: ReadonlySet<number>;
}

interface ProyectoConAcceso {
  proyecto: ProyectoLeido;
  acceso: Acceso;
}

/** Rúbrica con la que se mide un RAP y los indicadores que valora. */
interface RubricaParaMedir {
  id: number;
  version: number | null;
  idEscala: number | null;
  idsIndicador: number[];
}

/** Lo que hace falta leer de una medición para su hoja de valoración. */
const INCLUIR_MEDICION = {
  rap: { select: { id: true, codigo: true, numero: true, descripcion: true } },
  rubrica: {
    select: {
      id: true,
      version: true,
      id_escala: true,
      rubrica_descriptor: {
        select: {
          id_indicador: true,
          descripcion: true,
          nivel_escala: { select: { valor: true } },
        },
      },
    },
  },
  medicion_indicador: {
    select: {
      id: true,
      id_indicador: true,
      instrumento: true,
      descripcion_instrumento: true,
      indicador_rap: { select: { numero: true, descripcion: true } },
      valoracion_estudiante: {
        select: {
          id_matricula: true,
          nivel_escala: { select: { valor: true } },
        },
      },
    },
    orderBy: { indicador_rap: { numero: 'asc' } },
  },
  usuario_medicion_rap_id_registrado_porTousuario: {
    select: { nombres: true, apellidos: true },
  },
  usuario_medicion_rap_id_cerrado_porTousuario: {
    select: { nombres: true, apellidos: true },
  },
} satisfies Prisma.medicion_rapInclude;

type MedicionLeida = Prisma.medicion_rapGetPayload<{
  include: typeof INCLUIR_MEDICION;
}>;

/**
 * Lo que hace falta para registrar instrumentos o valoraciones. El autoguardado del teléfono
 * llega cada pocos segundos: no relee todas las valoraciones solo para comprobar el acceso.
 */
const INCLUIR_MEDICION_EDICION = {
  rubrica: { select: { id_escala: true } },
  medicion_indicador: { select: { id: true, id_indicador: true } },
} satisfies Prisma.medicion_rapInclude;

type MedicionEnEdicion = Prisma.medicion_rapGetPayload<{
  include: typeof INCLUIR_MEDICION_EDICION;
}>;

/**
 * Medición de RAP (RF-30, HU-11-01 a HU-11-03): la hoja «Valoración» del formato
 * FO-DO/PC-023. El docente asignado al curso la inicia sobre un RAP del curso con rúbrica
 * vigente, registra el instrumento de cada indicador y el nivel de cada estudiante en cada
 * indicador. Las tablas resumen no se guardan: se calculan desde las valoraciones (RF-31).
 */
@Injectable()
export class MedicionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alcance: AlcanceService,
    private readonly consolidados: ConsolidadoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Módulo de medición (RF-30, p1; RF-31, p1): las mediciones que el usuario puede abrir, con
   * su resultado. El docente ve las de sus cursos; el líder RAP, las de los RAP que lidera en
   * cada período; el departamento, las de su programa.
   */
  async listar(
    usuario: UsuarioSesion,
    { pagina, tamano, estado, idRap }: ConsultarMedicionesDto,
  ): Promise<PaginaMedicionesDto> {
    const visibles = await this.filtroVisibilidad(usuario);
    if (!visibles) {
      return { elementos: [], pagina, tamano, total: 0 };
    }
    const donde: Prisma.medicion_rapWhereInput = {
      AND: [
        visibles,
        { id_proyecto_docente: { not: null } },
        estado ? { estado } : {},
        idRap ? { id_rap: idRap } : {},
      ],
    };
    const [total, filas] = await Promise.all([
      this.prisma.medicion_rap.count({ where: donde }),
      this.prisma.medicion_rap.findMany({
        where: donde,
        include: {
          rap: true,
          rubrica: { select: { version: true } },
          proyecto_docente: { select: SELECCION_PROYECTO },
        },
        orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
        skip: (pagina - 1) * tamano,
        take: tamano,
      }),
    ]);
    const consolidados = await this.consolidados.deMediciones(
      filas.map((fila) => fila.id),
    );
    return {
      elementos: filas.map((fila) => {
        const consolidado = consolidados.get(fila.id);
        return {
          ...aResumen(
            fila,
            fila.proyecto_docente as ProyectoLeido,
            fila.rubrica?.version ?? null,
          ),
          porcentajeCumplimiento: consolidado?.porcentajeCumplimiento ?? null,
          valoracionesEnCumplimiento:
            consolidado?.valoracionesEnCumplimiento ?? 0,
          valoracionesTotales: consolidado?.valoracionesTotales ?? 0,
          porcentajeEsperado: consolidado?.porcentajeEsperado ?? null,
          alcanzado: consolidado?.alcanzado ?? null,
        };
      }),
      pagina,
      tamano,
      total,
    };
  }

  /** RF-30, p1 y p2: precondiciones del curso, RAP medibles y mediciones registradas. */
  async delProyecto(
    usuario: UsuarioSesion,
    idProyecto: number,
  ): Promise<MedicionesDelProyectoDto> {
    const { proyecto, acceso } = await this.exigirProyecto(usuario, idProyecto);
    const idsRap = proyecto.proyecto_docente_rap.map((fila) => fila.id_rap);
    // El líder RAP solo ve los RAP que lidera; el docente y el departamento, todos los del curso.
    const rapsVisibles =
      acceso.docenteAsignado || acceso.departamento
        ? idsRap
        : idsRap.filter((id) => acceso.rapsLiderados.has(id));

    const [matriculados, rubricas, mediciones] = await Promise.all([
      this.contarMatriculados(proyecto.id),
      this.rubricasParaMedir(proyecto.proyecto_docente_rap),
      this.prisma.medicion_rap.findMany({
        where: {
          id_proyecto_docente: proyecto.id,
          id_rap: { in: rapsVisibles },
        },
        include: { rap: true, rubrica: { select: { version: true } } },
        orderBy: [{ anio_toma: 'desc' }, { id: 'desc' }],
      }),
    ]);

    return {
      proyecto: aProyecto(proyecto),
      estadoProyecto: proyecto.estado_proyecto
        ? {
            codigo: proyecto.estado_proyecto.codigo ?? '',
            nombre: proyecto.estado_proyecto.nombre ?? '',
          }
        : null,
      requisitos: {
        proyectoAprobado: estaAprobado(proyecto),
        periodoAbierto: !proyecto.periodo_academico?.cerrado,
        listaCargada: matriculados > 0,
        matriculados,
      },
      puedeRegistrar: acceso.docenteAsignado,
      periodoSugerido: periodoSugerido(proyecto.periodo_academico?.codigo),
      raps: proyecto.proyecto_docente_rap
        .filter((fila) => rapsVisibles.includes(fila.id_rap))
        .map((fila) => {
          const rubrica = rubricas.get(fila.id_rap);
          return {
            ...aRap(fila.rap),
            rubricaVigente: rubrica
              ? {
                  id: rubrica.id,
                  version: rubrica.version,
                  indicadores: rubrica.idsIndicador.length,
                }
              : null,
          };
        }),
      mediciones: mediciones.map((medicion) =>
        aResumen(medicion, proyecto, medicion.rubrica?.version ?? null),
      ),
    };
  }

  /**
   * HU-11-01: inicia la medición en borrador, asociada a la versión de rúbrica vigente y con
   * un registro por indicador. Copia el porcentaje esperado de la escala, para que cambiar la
   * meta no reescriba las mediciones pasadas.
   */
  async iniciar(
    usuario: UsuarioSesion,
    idProyecto: number,
    datos: IniciarMedicionDto,
  ): Promise<MedicionDetalleDto> {
    const { proyecto, acceso } = await this.exigirProyecto(usuario, idProyecto);
    if (!acceso.docenteAsignado) {
      throw new ForbiddenException(MENSAJE_SOLO_DOCENTE_ASIGNADO);
    }
    if (!estaAprobado(proyecto)) {
      throw new ConflictException(MENSAJE_PROYECTO_NO_APROBADO);
    }
    // RF-17: un período cerrado bloquea los registros.
    if (proyecto.periodo_academico?.cerrado) {
      throw new ConflictException(MENSAJE_PERIODO_CERRADO);
    }
    // RF-30, excepción de p1.
    if ((await this.contarMatriculados(proyecto.id)) === 0) {
      throw new ConflictException(MENSAJE_SIN_LISTA);
    }
    const rapDelProyecto = proyecto.proyecto_docente_rap.find(
      (fila) => fila.id_rap === datos.idRap,
    );
    if (!rapDelProyecto) {
      throw new BadRequestException(MENSAJE_RAP_NO_DEL_PROYECTO);
    }
    // RF-30, excepción de p3.
    const rubrica = (await this.rubricasParaMedir([rapDelProyecto])).get(
      datos.idRap,
    );
    if (!rubrica) {
      throw new ConflictException(MENSAJE_SIN_RUBRICA);
    }
    const escala = await this.escalaDeMedicion(
      rubrica.idEscala,
      proyecto.asignatura?.id_programa ?? null,
    );
    if (!escala) {
      throw new ConflictException(MENSAJE_SIN_ESCALA);
    }

    let idMedicion: number;
    try {
      const creada = await this.prisma.medicion_rap.create({
        data: {
          id_proyecto_docente: proyecto.id,
          id_rap: datos.idRap,
          id_rubrica: rubrica.id,
          tipo_valoracion: datos.tipoValoracion,
          periodo_toma: datos.periodoToma,
          anio_toma: datos.anioToma,
          tamano_cohorte: datos.tamanoCohorte ?? null,
          porcentaje_esperado: escala.porcentaje_esperado,
          estado: ESTADO_MEDICION.borrador,
          id_registrado_por: usuario.id,
          medicion_indicador: {
            create: rubrica.idsIndicador.map((idIndicador) => ({
              id_indicador: idIndicador,
            })),
          },
        },
        select: { id: true },
      });
      idMedicion = creada.id;
    } catch (error) {
      // El índice único (proyecto, RAP, tipo, año) atiende también dos inicios simultáneos.
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(MENSAJE_MEDICION_EXISTENTE);
      }
      throw error;
    }

    await this.auditoria.registrar({
      accion: 'crear',
      tablaAfectada: 'medicion_rap',
      idRegistro: idMedicion,
      valorNuevo: {
        idProyecto: proyecto.id,
        idRap: datos.idRap,
        idRubrica: rubrica.id,
        tipoValoracion: datos.tipoValoracion,
        periodoToma: datos.periodoToma,
        anioToma: datos.anioToma,
      },
    });
    return this.detalle(usuario, idMedicion, { proyecto, acceso });
  }

  /**
   * Hoja de valoración de la medición. Es una consulta de datos personales: la audita
   * `@AuditarConsulta('medicion_rap')` en el controlador.
   */
  obtener(
    usuario: UsuarioSesion,
    idMedicion: number,
  ): Promise<MedicionDetalleDto> {
    return this.detalle(usuario, idMedicion);
  }

  /** HU-11-02: instrumento y descripción por indicador. Solo cambia los que se envían. */
  async registrarInstrumentos(
    usuario: UsuarioSesion,
    idMedicion: number,
    { indicadores }: RegistrarInstrumentosDto,
  ): Promise<MedicionDetalleDto> {
    const { medicion, ...contexto } = await this.exigirEditable(
      usuario,
      idMedicion,
    );
    const porIndicador = new Map(
      medicion.medicion_indicador.map((fila) => [fila.id_indicador, fila.id]),
    );
    const vistos = new Set<number>();
    for (const { idIndicador } of indicadores) {
      if (!porIndicador.has(idIndicador) || vistos.has(idIndicador)) {
        throw new BadRequestException(MENSAJE_INDICADOR_NO_DE_MEDICION);
      }
      vistos.add(idIndicador);
    }

    const anteriores = await this.prisma.$transaction(
      async (tx) => {
        await this.bloquearBorrador(tx, idMedicion);
        // Con la fila bloqueada: los valores que se reemplazan, para la auditoría.
        const previos = await tx.medicion_indicador.findMany({
          where: {
            id_medicion: idMedicion,
            id_indicador: { in: indicadores.map((fila) => fila.idIndicador) },
          },
          select: {
            id_indicador: true,
            instrumento: true,
            descripcion_instrumento: true,
          },
          orderBy: { id_indicador: 'asc' },
        });
        for (const indicador of indicadores) {
          await tx.medicion_indicador.update({
            where: { id: porIndicador.get(indicador.idIndicador) },
            data: {
              instrumento: indicador.instrumento,
              descripcion_instrumento: indicador.descripcionInstrumento ?? null,
            },
          });
        }
        await tx.medicion_rap.update({
          where: { id: idMedicion },
          data: { updated_at: new Date() },
        });
        return previos;
      },
      { timeout: TIEMPO_MAXIMO_GUARDADO_MS },
    );

    await this.auditoria.registrar({
      accion: 'actualizar',
      tablaAfectada: 'medicion_rap',
      idRegistro: idMedicion,
      valorAnterior: {
        instrumentos: anteriores.map((fila) => ({
          idIndicador: fila.id_indicador,
          instrumento: fila.instrumento,
          descripcionInstrumento: fila.descripcion_instrumento,
        })),
      },
      valorNuevo: {
        instrumentos: indicadores.map(
          ({ idIndicador, instrumento, descripcionInstrumento }) => ({
            idIndicador,
            instrumento,
            descripcionInstrumento: descripcionInstrumento ?? null,
          }),
        ),
      },
    });
    return this.detalle(usuario, idMedicion, contexto);
  }

  /**
   * HU-11-03: guarda los niveles enviados. Un nivel nulo deja al estudiante sin valorar en
   * ese indicador, y así queda fuera de la muestra (RF-30, excepción de p6). Todo o nada.
   */
  async registrarValoraciones(
    usuario: UsuarioSesion,
    idMedicion: number,
    { valoraciones }: RegistrarValoracionesDto,
  ): Promise<ResultadoValoracionesDto> {
    const { medicion, proyecto } = await this.exigirEditable(
      usuario,
      idMedicion,
    );
    const escala = await this.escalaDeMedicion(
      medicion.rubrica?.id_escala ?? null,
      proyecto.asignatura?.id_programa ?? null,
    );
    if (!escala) {
      throw new ConflictException(MENSAJE_SIN_ESCALA);
    }
    const nivelPorValor = new Map(
      escala.nivel_escala
        .filter((nivel) => nivel.valor !== null)
        .map((nivel) => [nivel.valor as number, nivel.id]),
    );
    const medicionIndicadorPor = new Map(
      medicion.medicion_indicador.map((fila) => [fila.id_indicador, fila.id]),
    );

    const celdas = new Set<string>();
    for (const { idMatricula, idIndicador, valor } of valoraciones) {
      const celda = `${idMatricula}:${idIndicador}`;
      if (celdas.has(celda)) {
        throw new BadRequestException(MENSAJE_CELDA_REPETIDA);
      }
      celdas.add(celda);
      if (!medicionIndicadorPor.has(idIndicador)) {
        throw new BadRequestException(MENSAJE_INDICADOR_NO_DE_MEDICION);
      }
      if (valor !== null && !nivelPorValor.has(valor)) {
        throw new BadRequestException(MENSAJE_NIVEL_INVALIDO);
      }
    }

    // Solo los estudiantes que muestra la hoja: los matriculados y los retirados que ya
    // tenían valoraciones en esta medición.
    const idsMatricula = [...new Set(valoraciones.map((v) => v.idMatricula))];
    const validas = await this.prisma.matricula.count({
      where: {
        id: { in: idsMatricula },
        id_proyecto_docente: proyecto.id,
        OR: [
          { estado: ESTADO_MATRICULA.matriculado },
          {
            valoracion_estudiante: {
              some: { medicion_indicador: { id_medicion: idMedicion } },
            },
          },
        ],
      },
    });
    if (validas !== idsMatricula.length) {
      throw new BadRequestException(MENSAJE_ESTUDIANTE_NO_DEL_CURSO);
    }

    // Por indicador: se borran las celdas enviadas y se crean las que traen nivel. Son pocas
    // consultas aunque el curso tenga 40 estudiantes (RF-30, q2).
    const porMedicionIndicador = new Map<number, number[]>();
    const nuevas: Prisma.valoracion_estudianteCreateManyInput[] = [];
    for (const { idMatricula, idIndicador, valor } of valoraciones) {
      const idMedicionIndicador = medicionIndicadorPor.get(
        idIndicador,
      ) as number;
      const grupo = porMedicionIndicador.get(idMedicionIndicador) ?? [];
      grupo.push(idMatricula);
      porMedicionIndicador.set(idMedicionIndicador, grupo);
      if (valor !== null) {
        nuevas.push({
          id_medicion_indicador: idMedicionIndicador,
          id_matricula: idMatricula,
          id_nivel: nivelPorValor.get(valor),
        });
      }
    }

    await this.prisma.$transaction(
      async (tx) => {
        await this.bloquearBorrador(tx, idMedicion);
        for (const [idMedicionIndicador, matriculas] of porMedicionIndicador) {
          await tx.valoracion_estudiante.deleteMany({
            where: {
              id_medicion_indicador: idMedicionIndicador,
              id_matricula: { in: matriculas },
            },
          });
        }
        if (nuevas.length > 0) {
          await tx.valoracion_estudiante.createMany({ data: nuevas });
        }
        await tx.medicion_rap.update({
          where: { id: idMedicion },
          data: { updated_at: new Date() },
        });
      },
      { timeout: TIEMPO_MAXIMO_GUARDADO_MS },
    );

    const resultado = {
      registradas: nuevas.length,
      borradas: valoraciones.length - nuevas.length,
    };
    // Solo conteos: la auditoría no repite los niveles de cada estudiante (Ley 1581).
    await this.auditoria.registrar({
      accion: 'actualizar',
      tablaAfectada: 'medicion_rap',
      idRegistro: idMedicion,
      valorNuevo: { valoraciones: resultado },
    });
    return resultado;
  }

  /**
   * HU-11-04 y HU-11-05: tablas resumen y porcentual, muestra, cohorte y juicio frente a la
   * meta. Se calcula desde las valoraciones cada vez (RF-31, «Comentarios»).
   */
  async consolidado(
    usuario: UsuarioSesion,
    idMedicion: number,
  ): Promise<ConsolidadoDto> {
    const { medicion, proyecto } = await this.exigirMedicion(
      usuario,
      idMedicion,
    );
    const [escala, totalEstudiantes] = await Promise.all([
      this.escalaDeMedicion(
        medicion.rubrica?.id_escala ?? null,
        proyecto.asignatura?.id_programa ?? null,
      ),
      this.prisma.matricula.count({
        where: filtroHoja(proyecto.id, medicion.id),
      }),
    ]);
    if (!escala) {
      throw new ConflictException(MENSAJE_SIN_ESCALA);
    }
    return armarConsolidado(medicion, escala, totalEstudiantes);
  }

  /**
   * HU-11-06: acciones implementadas, resultados obtenidos y acciones propuestas (hoja
   * «Evaluación»). Los registra el docente del curso o el líder del RAP, en borrador.
   */
  async registrarAnalisis(
    usuario: UsuarioSesion,
    idMedicion: number,
    datos: RegistrarAnalisisDto,
  ): Promise<MedicionDetalleDto> {
    const { proyecto, acceso } = await this.exigirAnalizable(
      usuario,
      idMedicion,
    );
    const cambios: Prisma.medicion_rapUpdateInput = {};
    if (datos.accionesImplementadas !== undefined) {
      cambios.acciones_implementadas = datos.accionesImplementadas;
    }
    if (datos.resultadosObtenidos !== undefined) {
      cambios.resultados_obtenidos = datos.resultadosObtenidos;
    }
    if (datos.accionesPropuestas !== undefined) {
      cambios.acciones_propuestas = datos.accionesPropuestas;
    }
    await this.prisma.$transaction(async (tx) => {
      await this.bloquearBorrador(tx, idMedicion);
      await tx.medicion_rap.update({
        where: { id: idMedicion },
        data: { ...cambios, updated_at: new Date() },
      });
    });
    // Solo los campos del análisis que se enviaron, con su texto nuevo.
    await this.auditoria.registrar({
      accion: 'actualizar',
      tablaAfectada: 'medicion_rap',
      idRegistro: idMedicion,
      valorNuevo: cambios as Prisma.InputJsonValue,
    });
    return this.detalle(usuario, idMedicion, { proyecto, acceso });
  }

  /**
   * HU-11-07 (RF-31, p6 y p7): cierra la medición con usuario y fecha, y desde ahí sus
   * valoraciones quedan bloqueadas y alimenta el reporte de logro. No se cierra sin
   * valoraciones, ni por debajo de la meta sin acciones propuestas (excepción de p6).
   */
  async cerrar(
    usuario: UsuarioSesion,
    idMedicion: number,
  ): Promise<MedicionDetalleDto> {
    const { medicion, proyecto, acceso } = await this.exigirAnalizable(
      usuario,
      idMedicion,
    );
    const escala = await this.escalaDeMedicion(
      medicion.rubrica?.id_escala ?? null,
      proyecto.asignatura?.id_programa ?? null,
    );
    if (!escala) {
      throw new ConflictException(MENSAJE_SIN_ESCALA);
    }

    const resultado = await this.prisma.$transaction(async (tx) => {
      await this.bloquearBorrador(tx, idMedicion);
      // Con la fila bloqueada, nadie guarda valoraciones: se lee el estado definitivo.
      const [actual, valoraciones] = await Promise.all([
        tx.medicion_rap.findUniqueOrThrow({
          where: { id: idMedicion },
          select: { acciones_propuestas: true },
        }),
        tx.valoracion_estudiante.findMany({
          where: { medicion_indicador: { is: { id_medicion: idMedicion } } },
          select: {
            medicion_indicador: { select: { id_indicador: true } },
            nivel_escala: { select: { valor: true } },
          },
        }),
      ]);
      const conteos = contarPorIndicador(
        valoraciones.flatMap((fila) =>
          fila.medicion_indicador?.id_indicador != null &&
          fila.nivel_escala?.valor != null
            ? [
                {
                  idIndicador: fila.medicion_indicador.id_indicador,
                  valor: fila.nivel_escala.valor,
                },
              ]
            : [],
        ),
      );
      const consolidado = armarConsolidado(medicion, escala, null, conteos);
      if (consolidado.tamanoMuestra === 0) {
        throw new ConflictException(MENSAJE_SIN_VALORACIONES);
      }
      if (consolidado.alcanzado === false && !actual.acciones_propuestas) {
        throw new ConflictException(MENSAJE_FALTAN_ACCIONES_PROPUESTAS);
      }
      await tx.medicion_rap.update({
        where: { id: idMedicion },
        data: {
          estado: ESTADO_MEDICION.cerrada,
          id_cerrado_por: usuario.id,
          fecha_cierre: new Date(),
        },
      });
      return consolidado;
    });

    await this.auditoria.registrar({
      accion: 'actualizar',
      tablaAfectada: 'medicion_rap',
      idRegistro: idMedicion,
      valorAnterior: { estado: ESTADO_MEDICION.borrador },
      valorNuevo: {
        estado: ESTADO_MEDICION.cerrada,
        porcentajeCumplimiento: resultado.porcentajeCumplimiento,
        porcentajeEsperado: resultado.porcentajeEsperado,
      },
    });
    return this.detalle(usuario, idMedicion, { proyecto, acceso });
  }

  /** RF-30, excepción de p7: solo el departamento académico del programa la reabre. */
  async reabrir(
    usuario: UsuarioSesion,
    idMedicion: number,
  ): Promise<MedicionDetalleDto> {
    const { proyecto, acceso } = await this.exigirMedicion(usuario, idMedicion);
    if (!acceso.departamento) {
      throw new ForbiddenException(MENSAJE_SOLO_DEPARTAMENTO_REABRE);
    }
    const anterior = await this.prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<
        { estado: string | null; id_cerrado_por: number | null }[]
      >`SELECT estado, id_cerrado_por FROM medicion_rap WHERE id = ${idMedicion} FOR UPDATE`;
      if (aEstado(filas[0]?.estado ?? null) !== ESTADO_MEDICION.cerrada) {
        throw new ConflictException(MENSAJE_MEDICION_NO_CERRADA);
      }
      await tx.medicion_rap.update({
        where: { id: idMedicion },
        data: {
          estado: ESTADO_MEDICION.borrador,
          id_cerrado_por: null,
          fecha_cierre: null,
        },
      });
      return filas[0];
    });
    await this.auditoria.registrar({
      accion: 'actualizar',
      tablaAfectada: 'medicion_rap',
      idRegistro: idMedicion,
      valorAnterior: {
        estado: ESTADO_MEDICION.cerrada,
        idCerradoPor: anterior.id_cerrado_por,
      },
      valorNuevo: { estado: ESTADO_MEDICION.borrador },
    });
    return this.detalle(usuario, idMedicion, { proyecto, acceso });
  }

  // ---------------------------------------------------------------------------------------
  // Lectura y acceso
  // ---------------------------------------------------------------------------------------

  /**
   * Hoja de la medición. Tras una escritura se pasa el `contexto` ya comprobado: solo se
   * vuelve a leer la medición, no el acceso.
   */
  private async detalle(
    usuario: UsuarioSesion,
    idMedicion: number,
    contexto?: ProyectoConAcceso,
  ): Promise<MedicionDetalleDto> {
    const { medicion, proyecto, acceso } = contexto
      ? {
          ...contexto,
          medicion: await this.prisma.medicion_rap.findUniqueOrThrow({
            where: { id: idMedicion },
            include: INCLUIR_MEDICION,
          }),
        }
      : await this.exigirMedicion(usuario, idMedicion);
    const [escala, matriculas] = await Promise.all([
      this.escalaDeMedicion(
        medicion.rubrica?.id_escala ?? null,
        proyecto.asignatura?.id_programa ?? null,
      ),
      this.prisma.matricula.findMany({
        where: filtroHoja(proyecto.id, medicion.id),
        select: {
          id: true,
          estado: true,
          estudiante: {
            select: { identificacion: true, nombres: true, apellidos: true },
          },
        },
        orderBy: [
          { estudiante: { apellidos: 'asc' } },
          { estudiante: { nombres: 'asc' } },
          { id: 'asc' },
        ],
      }),
    ]);

    if (!escala) {
      throw new ConflictException(MENSAJE_SIN_ESCALA);
    }

    const estado = aEstado(medicion.estado);
    return {
      ...aResumen(medicion, proyecto, medicion.rubrica?.version ?? null),
      tamanoCohorte: medicion.tamano_cohorte,
      porcentajeEsperado:
        medicion.porcentaje_esperado === null
          ? null
          : Number(medicion.porcentaje_esperado),
      escala: aEscala(escala),
      indicadores: aIndicadores(medicion),
      estudiantes: aEstudiantes(medicion, matriculas),
      registradoPor: nombreCompleto(
        medicion.usuario_medicion_rap_id_registrado_porTousuario,
      ),
      puedeEditar:
        acceso.docenteAsignado && estado === ESTADO_MEDICION.borrador,
      consolidado: armarConsolidado(medicion, escala, matriculas.length),
      accionesImplementadas: medicion.acciones_implementadas,
      resultadosObtenidos: medicion.resultados_obtenidos,
      accionesPropuestas: medicion.acciones_propuestas,
      cerradoPor: nombreCompleto(
        medicion.usuario_medicion_rap_id_cerrado_porTousuario,
      ),
      fechaCierre: medicion.fecha_cierre?.toISOString() ?? null,
      puedeAnalizar:
        estado === ESTADO_MEDICION.borrador && puedeAnalizar(acceso, medicion),
      puedeReabrir: estado === ESTADO_MEDICION.cerrada && acceso.departamento,
    };
  }

  /**
   * Lee el proyecto y resuelve el acceso del usuario. Responde 404 igual si no existe o si el
   * usuario no tiene ningún alcance sobre él, para no revelar cursos ajenos.
   */
  private async exigirProyecto(
    usuario: UsuarioSesion,
    idProyecto: number,
  ): Promise<ProyectoConAcceso> {
    const encontrado = await this.proyectoConAcceso(usuario, idProyecto);
    if (!encontrado) {
      throw new NotFoundException(MENSAJE_PROYECTO_NO_EXISTE);
    }
    const { acceso } = encontrado;
    if (
      !acceso.docenteAsignado &&
      !acceso.departamento &&
      acceso.rapsLiderados.size === 0
    ) {
      throw new NotFoundException(MENSAJE_PROYECTO_NO_EXISTE);
    }
    return encontrado;
  }

  private async exigirMedicion(
    usuario: UsuarioSesion,
    idMedicion: number,
  ): Promise<ProyectoConAcceso & { medicion: MedicionLeida }> {
    const medicion = await this.prisma.medicion_rap.findUnique({
      where: { id: idMedicion },
      include: INCLUIR_MEDICION,
    });
    return {
      ...(await this.accesoAMedicion(usuario, medicion)),
      medicion: medicion!,
    };
  }

  /** Para registrar: docente asignado y medición en borrador (RF-30, excepción de p7). */
  private async exigirEditable(
    usuario: UsuarioSesion,
    idMedicion: number,
  ): Promise<ProyectoConAcceso & { medicion: MedicionEnEdicion }> {
    const medicion = await this.prisma.medicion_rap.findUnique({
      where: { id: idMedicion },
      include: INCLUIR_MEDICION_EDICION,
    });
    const contexto = await this.accesoAMedicion(usuario, medicion);
    if (!contexto.acceso.docenteAsignado) {
      throw new ForbiddenException(MENSAJE_SOLO_DOCENTE_ASIGNADO);
    }
    if (aEstado(medicion!.estado) !== ESTADO_MEDICION.borrador) {
      throw new ConflictException(MENSAJE_MEDICION_CERRADA);
    }
    return { ...contexto, medicion: medicion! };
  }

  /**
   * Resuelve el acceso a una medición leída. Responde 404 igual si no existe o si el usuario
   * no la puede ver: docente asignado, departamento del programa o líder del RAP.
   */
  private async accesoAMedicion(
    usuario: UsuarioSesion,
    medicion: {
      id_proyecto_docente: number | null;
      id_rap: number | null;
    } | null,
  ): Promise<ProyectoConAcceso> {
    const encontrado =
      medicion?.id_proyecto_docente && medicion.id_rap
        ? await this.proyectoConAcceso(usuario, medicion.id_proyecto_docente)
        : null;
    if (!medicion || !encontrado) {
      throw new NotFoundException(MENSAJE_MEDICION_NO_EXISTE);
    }
    const { acceso } = encontrado;
    const ve =
      acceso.docenteAsignado ||
      acceso.departamento ||
      acceso.rapsLiderados.has(medicion.id_rap as number);
    if (!ve) {
      throw new NotFoundException(MENSAJE_MEDICION_NO_EXISTE);
    }
    return encontrado;
  }

  /** Para el análisis y el cierre: docente asignado o líder del RAP, en borrador. */
  private async exigirAnalizable(
    usuario: UsuarioSesion,
    idMedicion: number,
  ): Promise<ProyectoConAcceso & { medicion: MedicionLeida }> {
    const encontrada = await this.exigirMedicion(usuario, idMedicion);
    if (!puedeAnalizar(encontrada.acceso, encontrada.medicion)) {
      throw new ForbiddenException(MENSAJE_SOLO_DOCENTE_O_LIDER);
    }
    if (aEstado(encontrada.medicion.estado) !== ESTADO_MEDICION.borrador) {
      throw new ConflictException(MENSAJE_MEDICION_CERRADA);
    }
    return encontrada;
  }

  /**
   * Mediciones que un usuario puede abrir, como filtro de Prisma; nulo si ninguna. Mismos
   * alcances que la hoja: docente asignado, líder del RAP en el período del curso y
   * departamento del programa.
   */
  private async filtroVisibilidad(
    usuario: UsuarioSesion,
  ): Promise<Prisma.medicion_rapWhereInput | null> {
    const condiciones: Prisma.medicion_rapWhereInput[] = [];
    if (usuario.roles.includes(ROL.docente)) {
      condiciones.push({
        proyecto_docente: {
          is: {
            proyecto_docente_docente: { some: { id_usuario: usuario.id } },
          },
        },
      });
    }
    if (usuario.roles.includes(ROL.departamento)) {
      const { global, programas } = await this.alcance.alcance(usuario.id, [
        ROL.departamento,
      ]);
      if (global) {
        return {};
      }
      if (programas.length > 0) {
        condiciones.push({
          proyecto_docente: {
            is: { asignatura: { is: { id_programa: { in: programas } } } },
          },
        });
      }
    }
    if (usuario.roles.includes(ROL.liderRap)) {
      const liderados = await this.prisma.lider_rap.findMany({
        where: { id_usuario: usuario.id, activo: true, id_rap: { not: null } },
        select: { id_rap: true, id_periodo: true },
      });
      for (const { id_rap: idRap, id_periodo: idPeriodo } of liderados) {
        condiciones.push(
          idPeriodo === null
            ? { id_rap: idRap }
            : {
                id_rap: idRap,
                proyecto_docente: { is: { id_periodo: idPeriodo } },
              },
        );
      }
    }
    return condiciones.length > 0 ? { OR: condiciones } : null;
  }

  /**
   * Bloquea la fila de la medición dentro de la transacción y comprueba que siga en borrador:
   * si alguien la cerró entre la lectura y el guardado, no se modifica.
   */
  private async bloquearBorrador(
    tx: Prisma.TransactionClient,
    idMedicion: number,
  ): Promise<void> {
    const filas = await tx.$queryRaw<{ estado: string | null }[]>`
      SELECT estado FROM medicion_rap WHERE id = ${idMedicion} FOR UPDATE`;
    if (aEstado(filas[0]?.estado ?? null) !== ESTADO_MEDICION.borrador) {
      throw new ConflictException(MENSAJE_MEDICION_CERRADA);
    }
  }

  private async proyectoConAcceso(
    usuario: UsuarioSesion,
    idProyecto: number,
  ): Promise<ProyectoConAcceso | null> {
    const proyecto = await this.prisma.proyecto_docente.findUnique({
      where: { id: idProyecto },
      select: {
        ...SELECCION_PROYECTO,
        proyecto_docente_docente: {
          where: { id_usuario: usuario.id },
          select: { id_usuario: true },
        },
      },
    });
    if (!proyecto) {
      return null;
    }
    const idPrograma = proyecto.asignatura?.id_programa ?? null;
    const idsRap = proyecto.proyecto_docente_rap.map((fila) => fila.id_rap);

    const [departamento, liderados] = await Promise.all([
      usuario.roles.includes(ROL.departamento)
        ? this.alcance.alcanzaPrograma(
            usuario.id,
            [ROL.departamento],
            idPrograma,
          )
        : Promise.resolve(false),
      usuario.roles.includes(ROL.liderRap) && idsRap.length > 0
        ? this.prisma.lider_rap.findMany({
            where: {
              id_usuario: usuario.id,
              activo: true,
              id_rap: { in: idsRap },
              // El líder lo es por período: el del curso.
              OR: [{ id_periodo: proyecto.id_periodo }, { id_periodo: null }],
            },
            select: { id_rap: true },
          })
        : Promise.resolve([]),
    ]);

    return {
      proyecto,
      acceso: {
        docenteAsignado:
          usuario.roles.includes(ROL.docente) &&
          proyecto.proyecto_docente_docente.length > 0,
        departamento,
        rapsLiderados: new Set(
          liderados
            .map((fila) => fila.id_rap)
            .filter((id): id is number => id !== null),
        ),
      },
    };
  }

  private contarMatriculados(idProyecto: number): Promise<number> {
    return this.prisma.matricula.count({
      where: {
        id_proyecto_docente: idProyecto,
        estado: ESTADO_MATRICULA.matriculado,
      },
    });
  }

  /**
   * Rúbrica con que se mide cada RAP: la congelada para el curso en `proyecto_docente_rap`, si
   * la hay, o la vigente de versión más alta. Una rúbrica sin indicadores descritos no sirve
   * para medir y cuenta como inexistente (RF-30, excepción de p3).
   */
  private async rubricasParaMedir(
    raps: { id_rap: number; id_rubrica: number | null }[],
  ): Promise<Map<number, RubricaParaMedir>> {
    if (raps.length === 0) {
      return new Map();
    }
    const congeladas = raps
      .map((fila) => fila.id_rubrica)
      .filter((id): id is number => id !== null);
    const candidatas = await this.prisma.rubrica.findMany({
      where: {
        OR: [
          {
            id_rap: { in: raps.map((fila) => fila.id_rap) },
            estado: ESTADO_RUBRICA_VIGENTE,
          },
          ...(congeladas.length > 0 ? [{ id: { in: congeladas } }] : []),
        ],
      },
      select: {
        id: true,
        id_rap: true,
        version: true,
        estado: true,
        id_escala: true,
        rubrica_descriptor: {
          where: { indicador_rap: { is: { activo: true } } },
          select: { id_indicador: true },
        },
      },
      orderBy: [{ version: 'desc' }, { id: 'desc' }],
    });

    const resultado = new Map<number, RubricaParaMedir>();
    for (const { id_rap: idRap, id_rubrica: idCongelada } of raps) {
      const congelada = candidatas.find(
        (rubrica) =>
          rubrica.id === idCongelada &&
          rubrica.id_rap === idRap &&
          rubrica.estado !== 'borrador',
      );
      const elegida =
        congelada ??
        candidatas.find(
          (rubrica) =>
            rubrica.id_rap === idRap &&
            rubrica.estado === ESTADO_RUBRICA_VIGENTE,
        );
      if (!elegida) {
        continue;
      }
      const idsIndicador = [
        ...new Set(
          elegida.rubrica_descriptor
            .map((descriptor) => descriptor.id_indicador)
            .filter((id): id is number => id !== null),
        ),
      ];
      if (idsIndicador.length > 0) {
        resultado.set(idRap, {
          id: elegida.id,
          version: elegida.version,
          idEscala: elegida.id_escala,
          idsIndicador,
        });
      }
    }
    return resultado;
  }

  /** La escala de la rúbrica; si la rúbrica no la indica, la activa del programa (RF-07). */
  private async escalaDeMedicion(
    idEscalaRubrica: number | null,
    idPrograma: number | null,
  ) {
    let idEscala = idEscalaRubrica;
    if (idEscala === null && idPrograma !== null) {
      const programa = await this.prisma.programa.findUnique({
        where: { id: idPrograma },
        select: { id_escala_activa: true },
      });
      idEscala = programa?.id_escala_activa ?? null;
    }
    if (idEscala === null) {
      return null;
    }
    const escala = await this.prisma.escala_valoracion.findUnique({
      where: { id: idEscala },
      include: { nivel_escala: { orderBy: { valor: 'asc' } } },
    });
    // Sin niveles o sin umbral no hay con qué valorar ni qué contar como logrado: no se
    // inventan (CLAUDE.md, «Nada de datos de negocio hardcodeados»).
    return escala &&
      escala.nivel_escala.length > 0 &&
      escala.umbral_cumplimiento !== null
      ? escala
      : null;
  }
}

// -----------------------------------------------------------------------------------------
// Mapeo a las respuestas
// -----------------------------------------------------------------------------------------

function estaAprobado(proyecto: ProyectoLeido): boolean {
  const codigo = proyecto.estado_proyecto?.codigo ?? '';
  return (ESTADOS_PROYECTO_APROBADO as readonly string[]).includes(codigo);
}

/** 2026-2 → segundo período de 2026. Nulo si el código no tiene esa forma. */
export function periodoSugerido(
  codigo: string | null | undefined,
): PeriodoTomaSugeridoDto | null {
  const partes = /^(\d{4})-([12])$/.exec(codigo ?? '');
  if (!partes) {
    return null;
  }
  return {
    anioToma: Number(partes[1]),
    periodoToma: partes[2] === '1' ? PERIODO_TOMA.primer : PERIODO_TOMA.segundo,
  };
}

function aEstado(estado: string | null): EstadoMedicion {
  return estado === ESTADO_MEDICION.cerrada
    ? ESTADO_MEDICION.cerrada
    : ESTADO_MEDICION.borrador;
}

function aProyecto(proyecto: ProyectoLeido): ProyectoMedicionDto {
  return {
    id: proyecto.id,
    asignatura: proyecto.asignatura?.nombre ?? 'Asignatura sin nombre',
    grupo: proyecto.grupo,
    periodo: proyecto.periodo_academico?.codigo ?? null,
  };
}

function aRap(rap: {
  id: number;
  codigo: string | null;
  numero: number | null;
  descripcion: string | null;
}): RapMedicionDto {
  return {
    id: rap.id,
    codigo: rap.codigo,
    numero: rap.numero,
    descripcion: rap.descripcion,
  };
}

function aResumen(
  medicion: {
    id: number;
    tipo_valoracion: string | null;
    periodo_toma: string | null;
    anio_toma: number | null;
    estado: string | null;
    updated_at: Date | null;
    created_at: Date | null;
    rap: {
      id: number;
      codigo: string | null;
      numero: number | null;
      descripcion: string | null;
    } | null;
  },
  proyecto: ProyectoLeido,
  versionRubrica: number | null,
): MedicionResumenDto {
  return {
    id: medicion.id,
    proyecto: aProyecto(proyecto),
    rap: medicion.rap
      ? aRap(medicion.rap)
      : { id: 0, codigo: null, numero: null, descripcion: null },
    tipoValoracion:
      medicion.tipo_valoracion === TIPO_VALORACION.sumativa
        ? TIPO_VALORACION.sumativa
        : (TIPO_VALORACION.formativa as TipoValoracion),
    periodoToma:
      medicion.periodo_toma === PERIODO_TOMA.primer
        ? PERIODO_TOMA.primer
        : (PERIODO_TOMA.segundo as PeriodoToma),
    anioToma: medicion.anio_toma ?? 0,
    estado: aEstado(medicion.estado),
    versionRubrica,
    actualizada:
      (medicion.updated_at ?? medicion.created_at)?.toISOString() ?? null,
  };
}

function aEscala(escala: {
  nombre: string | null;
  umbral_cumplimiento: number | null;
  nivel_escala: { valor: number | null; etiqueta: string | null }[];
}): EscalaMedicionDto {
  return {
    nombre: escala.nombre,
    umbralCumplimiento: escala.umbral_cumplimiento as number,
    niveles: nivelesDeEscala(escala.nivel_escala),
  };
}

function aIndicadores(medicion: MedicionLeida): IndicadorMedicionDto[] {
  const descriptores = medicion.rubrica?.rubrica_descriptor ?? [];
  return medicion.medicion_indicador
    .filter((fila) => fila.id_indicador !== null)
    .map((fila) => ({
      idIndicador: fila.id_indicador as number,
      numero: fila.indicador_rap?.numero ?? null,
      descripcion: fila.indicador_rap?.descripcion ?? null,
      instrumento: fila.instrumento,
      descripcionInstrumento: fila.descripcion_instrumento,
      descriptores: descriptores
        .filter(
          (descriptor) =>
            descriptor.id_indicador === fila.id_indicador &&
            descriptor.nivel_escala?.valor != null,
        )
        .map((descriptor) => ({
          valor: descriptor.nivel_escala?.valor as number,
          descripcion: descriptor.descripcion ?? '',
        }))
        .sort((a, b) => a.valor - b.valor),
    }));
}

function aEstudiantes(
  medicion: MedicionLeida,
  matriculas: {
    id: number;
    estado: string | null;
    estudiante: {
      identificacion: string | null;
      nombres: string | null;
      apellidos: string | null;
    } | null;
  }[],
): EstudianteMedicionDto[] {
  const porMatricula = new Map<
    number,
    { idIndicador: number; valor: number }[]
  >();
  for (const fila of medicion.medicion_indicador) {
    for (const valoracion of fila.valoracion_estudiante) {
      const valor = valoracion.nivel_escala?.valor;
      if (
        valoracion.id_matricula === null ||
        valor == null ||
        fila.id_indicador === null
      ) {
        continue;
      }
      const lista = porMatricula.get(valoracion.id_matricula) ?? [];
      lista.push({ idIndicador: fila.id_indicador, valor });
      porMatricula.set(valoracion.id_matricula, lista);
    }
  }
  return matriculas.map((matricula) => ({
    idMatricula: matricula.id,
    documento: matricula.estudiante?.identificacion ?? '',
    nombres: matricula.estudiante?.nombres ?? '',
    apellidos: matricula.estudiante?.apellidos ?? '',
    retirado: matricula.estado === ESTADO_MATRICULA.retirado,
    valoraciones: porMatricula.get(matricula.id) ?? [],
  }));
}

function nombreCompleto(
  persona: { nombres: string | null; apellidos: string | null } | null,
): string | null {
  return (
    [persona?.nombres, persona?.apellidos].filter(Boolean).join(' ') || null
  );
}

function puedeAnalizar(acceso: Acceso, medicion: { id_rap: number | null }) {
  return (
    acceso.docenteAsignado ||
    (medicion.id_rap !== null && acceso.rapsLiderados.has(medicion.id_rap))
  );
}

/** Estudiantes de la hoja: los matriculados y los retirados que ya tenían valoraciones. */
function filtroHoja(
  idProyecto: number,
  idMedicion: number,
): Prisma.matriculaWhereInput {
  return {
    id_proyecto_docente: idProyecto,
    OR: [
      { estado: ESTADO_MATRICULA.matriculado },
      {
        valoracion_estudiante: {
          some: { medicion_indicador: { id_medicion: idMedicion } },
        },
      },
    ],
  };
}

/**
 * Consolidado de la medición con los datos ya leídos (RF-31). Si no se dan los conteos, se
 * toman de las valoraciones de la medición.
 */
function armarConsolidado(
  medicion: MedicionLeida,
  escala: {
    umbral_cumplimiento: number | null;
    nivel_escala: { valor: number | null; etiqueta: string | null }[];
  },
  totalEstudiantes: number | null,
  conteos?: Map<number, Map<number, number>>,
): Consolidado {
  const porIndicador =
    conteos ??
    contarPorIndicador(
      medicion.medicion_indicador.flatMap((fila) =>
        fila.id_indicador === null
          ? []
          : fila.valoracion_estudiante.flatMap((valoracion) =>
              valoracion.nivel_escala?.valor == null
                ? []
                : [
                    {
                      idIndicador: fila.id_indicador as number,
                      valor: valoracion.nivel_escala.valor,
                    },
                  ],
            ),
      ),
    );
  return consolidar({
    niveles: nivelesDeEscala(escala.nivel_escala),
    umbralCumplimiento: escala.umbral_cumplimiento as number,
    porcentajeEsperado:
      medicion.porcentaje_esperado === null
        ? null
        : Number(medicion.porcentaje_esperado),
    tamanoCohorte: medicion.tamano_cohorte,
    totalEstudiantes,
    indicadores: aIndicadores(medicion).map((indicador) => ({
      ...indicador,
      conteos: porIndicador.get(indicador.idIndicador) ?? new Map(),
    })),
  });
}
