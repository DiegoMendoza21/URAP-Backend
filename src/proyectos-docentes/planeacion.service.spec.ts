import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  BibliografiaService,
  mensajeReferenciaRepetida,
} from './bibliografia.service.js';
import {
  ContenidosService,
  mensajeSemanaFueraDelPeriodo,
  mensajeSemanaRepetida,
} from './contenidos.service.js';
import {
  GuardarBibliografiaDto,
  GuardarContenidosDto,
  GuardarEstrategiasDto,
  GuardarEvaluacionRacDto,
} from './dto/planeacion.dto.js';
import type { EdicionProyectoService } from './edicion-proyecto.service.js';
import { MENSAJE_PERIODO_SIN_SEMANAS } from './entities/secciones.js';
import {
  EstrategiasService,
  mensajeEstrategiaRepetida,
} from './estrategias.service.js';
import { EvaluacionService, pesoTotal } from './evaluacion.service.js';
import type { ProyectosDocentesService } from './proyectos-docentes.service.js';
import { MENSAJE_RAC_NO_EXISTE } from './rac.service.js';

// Datos ficticios: nunca datos reales de personas en las pruebas.
const docente: UsuarioSesion = {
  id: 20,
  nombres: 'Docente',
  apellidos: 'De Prueba',
  correo: 'docente.prueba@urap.local',
  roles: [ROL.docente],
  jti: 'jti-20',
  idSesion: 20,
};

type Cambio = (
  tx: unknown,
  ahora: Date,
) => Promise<{ resultado: unknown; auditoria: unknown }>;

/** `EdicionProyectoService` falso: ejecuta el cambio con el cliente dado y guarda la auditoría. */
function edicionFalsa(tx: unknown) {
  const auditorias: { anterior?: unknown; nuevo?: unknown }[] = [];
  const edicion = {
    consultable: vi.fn().mockResolvedValue({ id: 7, id_asignatura: 3 }),
    editar: vi.fn((_usuario: unknown, _id: number, cambio: Cambio) =>
      cambio(tx, new Date()).then((hecho) => {
        auditorias.push(hecho.auditoria as (typeof auditorias)[number]);
        return hecho.resultado;
      }),
    ),
  };
  return {
    edicion: edicion as unknown as EdicionProyectoService,
    espia: edicion,
    auditorias,
  };
}

async function errores<T extends object>(
  clase: new () => T,
  datos: object,
): Promise<string[]> {
  const dto = plainToInstance(clase, datos);
  const resultado = await validate(dto);
  const mensajes: string[] = [];
  const recorrer = (lista: typeof resultado) => {
    for (const error of lista) {
      mensajes.push(...Object.values(error.constraints ?? {}));
      recorrer(error.children ?? []);
    }
  };
  recorrer(resultado);
  return mensajes;
}

describe('EstrategiasService (RF-13)', () => {
  function crear() {
    let filas = [
      { id: 1, descripcion: 'Clase magistral', orden: 1 },
      { id: 2, descripcion: 'Estudio de caso', orden: 2 },
    ];
    const tx = {
      estrategia_metodologica: {
        findMany: vi.fn(() => Promise.resolve(filas)),
        deleteMany: vi.fn(() => {
          filas = [];
          return Promise.resolve({});
        }),
        createMany: vi.fn(
          ({ data }: { data: { descripcion: string; orden: number }[] }) => {
            filas = data.map((fila, i) => ({ id: 10 + i, ...fila }));
            return Promise.resolve({ count: data.length });
          },
        ),
        groupBy: vi
          .fn()
          .mockResolvedValue([
            { descripcion: 'Estudio de caso' },
            { descripcion: 'Aprendizaje basado en problemas' },
            { descripcion: 'aprendizaje  basado en problemas' },
          ]),
      },
      proyecto_docente: {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ asignatura: { id_programa: 1 } }),
      },
    };
    const { edicion, auditorias } = edicionFalsa(tx);
    const servicio = new EstrategiasService(
      tx as unknown as PrismaService,
      edicion,
    );
    return { servicio, tx, auditorias };
  }

  it('lista en orden y sugiere las del programa que aún no están, sin repetir', async () => {
    const { servicio } = crear();
    const seccion = await servicio.seccion(docente, 7);
    expect(seccion.estrategias).toEqual([
      { id: 1, numero: 1, descripcion: 'Clase magistral' },
      { id: 2, numero: 2, descripcion: 'Estudio de caso' },
    ]);
    expect(seccion.sugeridas).toEqual(['Aprendizaje basado en problemas']);
  });

  it('reemplaza el listado en el orden recibido y audita antes y después (p2-p4)', async () => {
    const { servicio, tx, auditorias } = crear();
    const seccion = await servicio.guardar(docente, 7, {
      estrategias: ['Estudio de caso', 'Clase magistral', 'Debate'],
    });
    expect(tx.estrategia_metodologica.deleteMany).toHaveBeenCalledWith({
      where: { id_proyecto_docente: 7 },
    });
    expect(seccion.estrategias.map((e) => [e.numero, e.descripcion])).toEqual([
      [1, 'Estudio de caso'],
      [2, 'Clase magistral'],
      [3, 'Debate'],
    ]);
    expect(auditorias[0]).toMatchObject({
      anterior: { estrategias: ['Clase magistral', 'Estudio de caso'] },
      nuevo: { estrategias: ['Estudio de caso', 'Clase magistral', 'Debate'] },
    });
  });

  it('un listado vacío se guarda: la sección queda pendiente (HU-06-08)', async () => {
    const { servicio, tx } = crear();
    const seccion = await servicio.guardar(docente, 7, { estrategias: [] });
    expect(seccion.estrategias).toEqual([]);
    expect(tx.estrategia_metodologica.createMany).not.toHaveBeenCalled();
  });

  it('rechaza estrategias repetidas sin distinguir mayúsculas', async () => {
    const { servicio, tx } = crear();
    await expect(
      servicio.guardar(docente, 7, {
        estrategias: ['Debate', 'debate '],
      }),
    ).rejects.toThrow(
      new BadRequestException(mensajeEstrategiaRepetida('debate ')),
    );
    expect(tx.estrategia_metodologica.deleteMany).not.toHaveBeenCalled();
  });

  it('el DTO recorta y no admite estrategias vacías', async () => {
    const dto = plainToInstance(GuardarEstrategiasDto, {
      estrategias: ['  Debate\r\n'],
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.estrategias).toEqual(['Debate']);
    expect(
      await errores(GuardarEstrategiasDto, { estrategias: ['   '] }),
    ).toContain('Hay una estrategia vacía.');
  });
});

describe('EvaluacionService (RF-14)', () => {
  const racBase = (id: number, codigo: string, evaluaciones: object[]) => ({
    id,
    codigo,
    descripcion: `Enunciado de ${codigo}`,
    orden: id,
    evaluacion_rac: evaluaciones,
    rac_rap: [{ rap: { id: 1, codigo: 'RAP 1', numero: 1 } }],
  });
  const actividad = (id: number, porcentaje: string | null) => ({
    id,
    descripcion: `Actividad ${id}`,
    instrumento: 'Rúbrica',
    porcentaje: porcentaje === null ? null : new Prisma.Decimal(porcentaje),
  });

  function crear() {
    const tx = {
      rac: {
        findFirst: vi.fn().mockResolvedValue(racBase(1, 'RAC 1', [])),
        findMany: vi
          .fn()
          .mockResolvedValue([
            racBase(1, 'RAC 1', [actividad(5, '60.5'), actividad(6, '39.5')]),
            racBase(2, 'RAC 2', []),
          ]),
      },
      evaluacion_rac: {
        deleteMany: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const { edicion, auditorias } = edicionFalsa(tx);
    return {
      servicio: new EvaluacionService(tx as unknown as PrismaService, edicion),
      tx,
      auditorias,
    };
  }

  it('presenta los RAC con su evaluación y señala los que no tienen (p2 y p4)', async () => {
    const { servicio } = crear();
    const seccion = await servicio.seccion(docente, 7);
    expect(seccion.racsSinEvaluacion).toEqual([2]);
    expect(seccion.racs[0]).toMatchObject({
      codigo: 'RAC 1',
      raps: ['RAP 1'],
      pesoTotal: 100,
      actividades: [
        {
          id: 5,
          actividad: 'Actividad 5',
          instrumento: 'Rúbrica',
          porcentaje: 60.5,
        },
        { id: 6, porcentaje: 39.5 },
      ],
    });
  });

  it('reemplaza las actividades del RAC (p3)', async () => {
    const { servicio, tx, auditorias } = crear();
    await servicio.guardar(docente, 7, 1, {
      actividades: [
        {
          actividad: 'Taller',
          instrumento: 'Lista de chequeo',
          porcentaje: 40,
        },
        { actividad: 'Informe', instrumento: 'Rúbrica' },
      ],
    });
    expect(tx.evaluacion_rac.deleteMany).toHaveBeenCalledWith({
      where: { id_rac: 1 },
    });
    expect(tx.evaluacion_rac.createMany).toHaveBeenCalledWith({
      data: [
        {
          id_rac: 1,
          descripcion: 'Taller',
          instrumento: 'Lista de chequeo',
          porcentaje: 40,
        },
        {
          id_rac: 1,
          descripcion: 'Informe',
          instrumento: 'Rúbrica',
          porcentaje: null,
        },
      ],
    });
    expect(auditorias[0]).toMatchObject({
      nuevo: {
        evaluacion: [
          { actividad: 'Taller', porcentaje: 40 },
          { actividad: 'Informe', porcentaje: null },
        ],
      },
    });
  });

  it('responde 404 con un RAC de otro proyecto', async () => {
    const { servicio, tx } = crear();
    tx.rac.findFirst.mockResolvedValue(null);
    await expect(
      servicio.guardar(docente, 7, 99, { actividades: [] }),
    ).rejects.toThrow(new NotFoundException(MENSAJE_RAC_NO_EXISTE));
    expect(tx.evaluacion_rac.deleteMany).not.toHaveBeenCalled();
  });

  it('suma los pesos con dos decimales, o nulo si no hay', () => {
    expect(
      pesoTotal([
        { porcentaje: 33.33 },
        { porcentaje: 33.33 },
        { porcentaje: 33.34 },
      ]),
    ).toBe(100);
    expect(pesoTotal([{ porcentaje: null }])).toBeNull();
  });

  it('el DTO exige actividad e instrumento y limita el peso', async () => {
    const mensajes = await errores(GuardarEvaluacionRacDto, {
      actividades: [{ actividad: ' ', instrumento: '', porcentaje: 120.555 }],
    });
    expect(mensajes).toEqual(
      expect.arrayContaining([
        'Describa la actividad de evaluación.',
        'Indique el instrumento de evaluación.',
        'El peso debe ser un número con hasta dos decimales.',
        'El peso no puede superar el 100 %.',
      ]),
    );
    expect(
      await errores(GuardarEvaluacionRacDto, {
        actividades: [
          { actividad: 'Taller', instrumento: 'Rúbrica', porcentaje: null },
        ],
      }),
    ).toEqual([]);
  });
});

describe('ContenidosService (RF-15)', () => {
  type FilaBd = {
    id: number;
    semana: number;
    tema: string | null;
    horas_tde: number | null;
    horas_tdp: number | null;
    horas_ti: number | null;
  };

  function crear(numeroSemanas: number | null = 3) {
    let filas: FilaBd[] = [
      {
        id: 40,
        semana: 1,
        tema: 'Presentación',
        horas_tde: 2,
        horas_tdp: 0,
        horas_ti: 4,
      },
      {
        id: 41,
        semana: 2,
        tema: 'Conceptos',
        horas_tde: 2,
        horas_tdp: 0,
        horas_ti: 4,
      },
    ];
    const tx = {
      proyecto_docente: {
        findUniqueOrThrow: vi.fn(() =>
          Promise.resolve({
            periodo_academico: { numero_semanas: numeroSemanas },
            asignatura: {
              creditos: null,
              horas_tde: 6,
              horas_tdp: null,
              horas_ti: 12,
              horas_totales: null,
            },
            contenido_programatico: [...filas].sort(
              (a, b) => a.semana - b.semana,
            ),
          }),
        ),
      },
      contenido_programatico: {
        findMany: vi.fn(() => Promise.resolve(filas)),
        update: vi.fn(
          ({
            where,
            data,
          }: {
            where: { id: number };
            data: Partial<FilaBd>;
          }) => {
            filas = filas.map((fila) =>
              fila.id === where.id ? { ...fila, ...data } : fila,
            );
            return Promise.resolve({});
          },
        ),
        createMany: vi.fn(({ data }: { data: Omit<FilaBd, 'id'>[] }) => {
          filas = [
            ...filas,
            ...data.map((fila, i) => ({ id: 50 + i, ...fila })),
          ];
          return Promise.resolve({ count: data.length });
        }),
      },
    };
    const { edicion, auditorias } = edicionFalsa(tx);
    return {
      servicio: new ContenidosService(tx as unknown as PrismaService, edicion),
      tx,
      auditorias,
    };
  }

  it('presenta una fila por semana del período y las que no tienen tema (p2 y p5)', async () => {
    const { servicio } = crear();
    const seccion = await servicio.seccion(docente, 7);
    expect(seccion.numeroSemanas).toBe(3);
    expect(seccion.semanas.map((s) => [s.semana, s.id, s.tema])).toEqual([
      [1, 40, 'Presentación'],
      [2, 41, 'Conceptos'],
      [3, null, null],
    ]);
    expect(seccion.semanasSinTema).toEqual([3]);
    expect(seccion.datosAsignaturaFaltantes).toEqual(['créditos', 'horas TDP']);
  });

  it('compara con las horas de la asignatura (p4)', async () => {
    const { servicio } = crear();
    const seccion = await servicio.seccion(docente, 7);
    expect(seccion.horasCoinciden).toBe(false);
    expect(seccion.comparacion).toEqual([
      { tipo: 'TDE', contenidos: 4, asignatura: 6, diferencia: -2 },
      { tipo: 'TDP', contenidos: 0, asignatura: null, diferencia: null },
      { tipo: 'TI', contenidos: 8, asignatura: 12, diferencia: -4 },
      { tipo: 'Total', contenidos: 12, asignatura: null, diferencia: null },
    ]);
  });

  it('actualiza en su lugar, crea las semanas nuevas y vacía sin borrar (para RF-20)', async () => {
    const { servicio, tx, auditorias } = crear();
    const seccion = await servicio.guardar(docente, 7, {
      semanas: [
        {
          semana: 1,
          tema: 'Presentación',
          horasTde: 2,
          horasTdp: 0,
          horasTi: 4,
        },
        { semana: 3, tema: 'Cierre', horasTde: 2, horasTdp: 0, horasTi: 4 },
      ],
    });
    // La semana 1 no cambió; la 2 se vació en su misma fila; la 3 se creó.
    expect(tx.contenido_programatico.update).toHaveBeenCalledTimes(1);
    expect(tx.contenido_programatico.update).toHaveBeenCalledWith({
      where: { id: 41 },
      data: { tema: null, horas_tde: null, horas_tdp: null, horas_ti: null },
    });
    expect(tx.contenido_programatico.createMany).toHaveBeenCalledWith({
      data: [
        {
          id_proyecto_docente: 7,
          semana: 3,
          tema: 'Cierre',
          horas_tde: 2,
          horas_tdp: 0,
          horas_ti: 4,
        },
      ],
    });
    expect(seccion.semanasSinTema).toEqual([2]);
    expect(seccion.semanas[1].id).toBe(41);
    // Constancia de la diferencia de horas (p4).
    expect(auditorias[0]).toMatchObject({
      anterior: { contenidos: { 2: { tema: 'Conceptos' } } },
      nuevo: {
        contenidos: { 2: { tema: null }, 3: { tema: 'Cierre' } },
        horasCoinciden: false,
      },
    });
  });

  it('rechaza semanas repetidas o fuera del período', async () => {
    const { servicio, tx } = crear();
    await expect(
      servicio.guardar(docente, 7, {
        semanas: [{ semana: 1 }, { semana: 1 }],
      }),
    ).rejects.toThrow(new BadRequestException(mensajeSemanaRepetida(1)));
    await expect(
      servicio.guardar(docente, 7, { semanas: [{ semana: 4, tema: 'Extra' }] }),
    ).rejects.toThrow(
      new BadRequestException(mensajeSemanaFueraDelPeriodo(4, 3)),
    );
    expect(tx.contenido_programatico.update).not.toHaveBeenCalled();
  });

  it('sin número de semanas en el período no presenta filas ni guarda', async () => {
    const { servicio } = crear(null);
    const seccion = await servicio.seccion(docente, 7);
    expect(seccion.semanas).toEqual([]);
    await expect(servicio.guardar(docente, 7, { semanas: [] })).rejects.toThrow(
      new ConflictException(MENSAJE_PERIODO_SIN_SEMANAS),
    );
  });

  it('el DTO trata un tema en blanco como vacío y valida las horas', async () => {
    const dto = plainToInstance(GuardarContenidosDto, {
      semanas: [{ semana: 1, tema: '   ', horasTde: 2 }],
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.semanas[0].tema).toBeNull();
    expect(
      await errores(GuardarContenidosDto, {
        semanas: [{ semana: 0, horasTde: -1, horasTi: 1.5 }],
      }),
    ).toEqual(
      expect.arrayContaining([
        'La semana debe ser 1 o mayor.',
        'Las horas TDE no pueden ser negativas.',
        'Las horas TI deben ser un número entero.',
      ]),
    );
  });
});

describe('BibliografiaService (RF-16)', () => {
  function crear() {
    let filas = [{ id: 1, referencia: 'Autor, A. (2020). Libro.', orden: 1 }];
    const tx = {
      bibliografia: {
        findMany: vi.fn(() => Promise.resolve(filas)),
        deleteMany: vi.fn(() => {
          filas = [];
          return Promise.resolve({});
        }),
        createMany: vi.fn(
          ({ data }: { data: { referencia: string; orden: number }[] }) => {
            filas = data.map((fila, i) => ({ id: 20 + i, ...fila }));
            return Promise.resolve({ count: data.length });
          },
        ),
      },
      proyecto_docente: {
        findMany: vi.fn(),
      },
    };
    const proyectos = {
      filtroVisibilidad: vi.fn().mockResolvedValue({
        proyecto_docente_docente: { some: { id_usuario: docente.id } },
      }),
    };
    const { edicion, auditorias } = edicionFalsa(tx);
    return {
      servicio: new BibliografiaService(
        tx as unknown as PrismaService,
        edicion,
        proyectos as unknown as ProyectosDocentesService,
      ),
      tx,
      proyectos,
      auditorias,
    };
  }

  it('numera el listado en el orden guardado (p3 y p4)', async () => {
    const { servicio, auditorias } = crear();
    const seccion = await servicio.guardar(docente, 7, {
      referencias: ['Autora, B. (2022). Artículo.', 'Autor, A. (2020). Libro.'],
    });
    expect(seccion.referencias.map((r) => [r.numero, r.referencia])).toEqual([
      [1, 'Autora, B. (2022). Artículo.'],
      [2, 'Autor, A. (2020). Libro.'],
    ]);
    expect(auditorias[0]).toMatchObject({
      anterior: { bibliografia: ['Autor, A. (2020). Libro.'] },
    });
  });

  it('rechaza referencias repetidas', async () => {
    const { servicio } = crear();
    await expect(
      servicio.guardar(docente, 7, { referencias: ['Libro', 'libro'] }),
    ).rejects.toThrow(
      new BadRequestException(mensajeReferenciaRepetida('libro')),
    );
  });

  it('ofrece primero los proyectos de la misma asignatura, dentro de lo visible (p2)', async () => {
    const { servicio, tx } = crear();
    const fila = (id: number, asignatura: string) => ({
      id,
      grupo: 'A',
      asignatura: { nombre: asignatura },
      periodo_academico: { codigo: '2026-1' },
      _count: { bibliografia: 3 },
    });
    tx.proyecto_docente.findMany
      .mockResolvedValueOnce([fila(4, 'Gestión ambiental')])
      .mockResolvedValueOnce([fila(5, 'Otra asignatura')]);
    const lista = await servicio.proyectosParaImportar(docente, 7);
    expect(lista.map((p) => [p.id, p.mismaAsignatura])).toEqual([
      [4, true],
      [5, false],
    ]);
    const primera = tx.proyecto_docente.findMany.mock.calls[0][0] as {
      where: { AND: object[] };
    };
    expect(primera.where.AND).toEqual(
      expect.arrayContaining([
        { proyecto_docente_docente: { some: { id_usuario: docente.id } } },
        { id_asignatura: 3 },
        { id: { not: 7 } },
      ]),
    );
  });

  it('sin proyectos visibles no ofrece nada', async () => {
    const { servicio, proyectos, tx } = crear();
    proyectos.filtroVisibilidad.mockResolvedValue(null);
    expect(await servicio.proyectosParaImportar(docente, 7)).toEqual([]);
    expect(tx.proyecto_docente.findMany).not.toHaveBeenCalled();
  });

  it('el DTO no admite referencias vacías', async () => {
    expect(
      await errores(GuardarBibliografiaDto, { referencias: ['Libro', ''] }),
    ).toContain('Hay una referencia vacía.');
  });
});
