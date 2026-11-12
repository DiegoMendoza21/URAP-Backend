import type { Prisma } from '../generated/prisma/client.js';
import {
  type AsignaturaPlan,
  PLAN_1702,
  PLAN_2502,
  type PlanEstudioSemilla,
  PLANES_DE_ESTUDIO,
} from './programa.js';
import { sembrarPlanesDeEstudio } from './sembrar-datos.js';

type Fila = Record<string, unknown> & { id: number };

/**
 * Una base en memoria con lo que usa el sembrado de los planes: planes, asignaturas, vínculos
 * con los RAP y requisitos. `findFirst` compara por igualdad, y un dato sin valor vale `null`,
 * como en la base.
 */
function baseEnMemoria() {
  const planes: Fila[] = [];
  const asignaturas: Fila[] = [];
  const vinculos = new Set<string>();
  const requisitos = new Set<string>();
  let siguiente = 1;
  const tx = {
    plan_estudio: {
      upsert: ({
        where,
        create,
      }: {
        where: { id_programa_codigo: { id_programa: number; codigo: string } };
        create: Record<string, unknown>;
      }) => {
        const { id_programa, codigo } = where.id_programa_codigo;
        let plan = planes.find(
          (fila) => fila.id_programa === id_programa && fila.codigo === codigo,
        );
        if (!plan) {
          plan = { id: siguiente++, ...create };
          planes.push(plan);
        }
        return Promise.resolve(plan);
      },
    },
    asignatura: {
      findFirst: ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          asignaturas.find((fila) =>
            Object.entries(where).every(
              ([campo, valor]) => (fila[campo] ?? null) === valor,
            ),
          ) ?? null,
        ),
      create: ({ data }: { data: Record<string, unknown> }) => {
        const fila = { id: siguiente++, ...data };
        asignaturas.push(fila);
        return Promise.resolve(fila);
      },
    },
    asignatura_rap: {
      upsert: ({
        create,
      }: {
        create: { id_asignatura: number; id_rap: number };
      }) => {
        vinculos.add(`${create.id_asignatura}-${create.id_rap}`);
        return Promise.resolve(create);
      },
    },
    asignatura_requisito: {
      upsert: ({
        create,
      }: {
        create: { id_asignatura: number; id_asignatura_requerida: number };
      }) => {
        requisitos.add(
          `${create.id_asignatura}-${create.id_asignatura_requerida}`,
        );
        return Promise.resolve(create);
      },
    },
  };
  const delPlan = (codigo: string) => {
    const plan = planes.find((fila) => fila.codigo === codigo);
    return asignaturas.filter((fila) => fila.id_plan_estudio === plan?.id);
  };
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    asignaturas,
    vinculos,
    requisitos,
    delPlan,
  };
}

const ID_PROGRAMA = 1;
const IDS_RAP = new Map(
  [1, 2, 3, 4, 5, 6, 7].map((numero) => [numero, 100 + numero]),
);

const sembrar = (
  tx: Prisma.TransactionClient,
  planes: readonly PlanEstudioSemilla[] = PLANES_DE_ESTUDIO,
) => sembrarPlanesDeEstudio(tx, ID_PROGRAMA, IDS_RAP, planes);

/** El plan 2502 como estaba antes de la malla del SMA: semestres 1 a 5, 36 asignaturas. */
const PLAN_2502_ANTERIOR = PLAN_2502.filter(
  ({ semestre, codigo_interno }) =>
    semestre <= 5 && codigo_interno !== 'FC72731',
);
const PLANES_ANTERIORES: PlanEstudioSemilla[] = [
  { codigo: '1702', nombre: 'Plan de estudios 1702', asignaturas: PLAN_1702 },
  {
    codigo: '2502',
    nombre: 'Plan de estudios 2502',
    asignaturas: PLAN_2502_ANTERIOR,
  },
];

function plan(asignaturas: AsignaturaPlan[]): PlanEstudioSemilla[] {
  return [{ codigo: 'P1', nombre: 'Plan de prueba', asignaturas }];
}

describe('sembrarPlanesDeEstudio', () => {
  it('en una base vacía deja 69 asignaturas en el plan 1702 y 74 en el 2502', async () => {
    const base = baseEnMemoria();
    await sembrar(base.tx);

    expect(base.delPlan('1702')).toHaveLength(69);
    expect(base.delPlan('2502')).toHaveLength(74);
    // Las cuatro «Formación humana» son cuatro filas, una por código.
    expect(
      base
        .delPlan('2502')
        .filter((fila) => fila.nombre === 'Formación humana')
        .map((fila) => fila.codigo_interno),
    ).toEqual(['FC72731', 'FC72737', 'FC72738', 'FC72739']);
    // 73 vínculos con los RAP, todos del 1702, y los tres prerrequisitos de las fichas.
    expect(base.vinculos.size).toBe(73);
    expect(base.requisitos.size).toBe(3);
  });

  it('sembrar otra vez no duplica ni cambia ninguna fila', async () => {
    const base = baseEnMemoria();
    await sembrar(base.tx);
    const antes = structuredClone(base.asignaturas);

    await sembrar(base.tx);

    expect(base.asignaturas).toEqual(antes);
    expect(base.vinculos.size).toBe(73);
    expect(base.requisitos.size).toBe(3);
  });

  it('sobre una base sembrada antes de la malla agrega las 38 del 2502 y no toca las demás', async () => {
    const base = baseEnMemoria();
    await sembrar(base.tx, PLANES_ANTERIORES);
    expect(base.delPlan('2502')).toHaveLength(36);
    const antes = structuredClone(base.asignaturas);

    await sembrar(base.tx);

    expect(base.delPlan('1702')).toHaveLength(69);
    expect(base.delPlan('2502')).toHaveLength(74);
    // Las que ya estaban conservan su id y todos sus datos.
    expect(base.asignaturas.slice(0, antes.length)).toEqual(antes);
    const nuevas = base.asignaturas.slice(antes.length);
    expect(nuevas).toHaveLength(38);
    for (const fila of nuevas) {
      expect(fila.horas_tde).toBeUndefined();
      expect(fila.horas_totales).toBeUndefined();
    }
  });

  it('guarda el componente y el tipo de curso de una asignatura sin ficha, sin horas', async () => {
    const base = baseEnMemoria();
    await sembrar(base.tx);
    const fila = (codigo: string) =>
      base.delPlan('2502').find((a) => a.codigo_interno === codigo);

    expect(fila('IX24209')).toMatchObject({
      nombre: 'Electiva II - GA',
      semestre: 9,
      creditos: 3,
      componente: 'PROFESIONAL',
      tipo_curso: 'Electivo',
    });
    expect(fila('FC72737')).toMatchObject({ componente: 'COMPLEMENTARIO' });
    expect(fila('FC72737')?.tipo_curso).toBeUndefined();
    expect(fila('IX24221')?.componente).toBeUndefined();
    // Con ficha siguen saliendo de ella, con sus horas.
    expect(fila('NC2505')).toMatchObject({
      componente: 'PROFESIONAL',
      tipo_curso: 'Obligatorio',
      horas_tde: 48,
      horas_tdp: 0,
      horas_ti: 96,
      horas_totales: 144,
    });
  });

  it('busca por código: dos asignaturas con el mismo nombre son dos filas', async () => {
    const base = baseEnMemoria();
    const asignaturas: AsignaturaPlan[] = [
      {
        semestre: 5,
        nombre: 'Formación humana',
        codigo_interno: 'A1',
        raps: [],
      },
      {
        semestre: 7,
        nombre: 'Formación humana',
        codigo_interno: 'A2',
        raps: [],
      },
    ];
    await sembrar(base.tx, plan(asignaturas));
    await sembrar(base.tx, plan(asignaturas));

    expect(
      base.asignaturas.map((fila) => [fila.codigo_interno, fila.semestre]),
    ).toEqual([
      ['A1', 5],
      ['A2', 7],
    ]);
  });

  it('si el código de una asignatura ya sembrada llega después, no la duplica', async () => {
    const base = baseEnMemoria();
    await sembrar(
      base.tx,
      plan([{ semestre: 1, nombre: 'Matemáticas I', raps: [1] }]),
    );
    await sembrar(
      base.tx,
      plan([
        {
          semestre: 1,
          nombre: 'Matemáticas I',
          codigo_interno: 'FP15101',
          creditos: 4,
          raps: [1],
        },
      ]),
    );

    expect(base.asignaturas).toHaveLength(1);
    // La fila que ya estaba no se modifica.
    expect(base.asignaturas[0].codigo_interno).toBeUndefined();
  });

  it('resuelve los prerrequisitos por nombre dentro del plan', async () => {
    const base = baseEnMemoria();
    await sembrar(base.tx);
    const id = (codigoPlan: string, nombre: string) =>
      base.delPlan(codigoPlan).find((fila) => fila.nombre === nombre)?.id;

    expect([...base.requisitos].sort()).toEqual(
      [
        `${id('1702', 'Comportamiento organizacional')}-${id('1702', 'Organización y dirección')}`,
        `${id('2502', 'Comportamiento organizacional')}-${id('2502', 'Organización y dirección')}`,
        `${id('2502', 'Fundamentos de investigación científica')}-${id('2502', 'Producción y comprensión textual II')}`,
      ].sort(),
    );
  });

  const ficha = (prerrequisitos: string[]) => ({
    componente: 'PROFESIONAL' as const,
    tipo_curso: 'Obligatorio' as const,
    horas_tde: 32,
    horas_tdp: 0,
    horas_ti: 64,
    prerrequisitos,
  });

  it('falla con un mensaje claro si un prerrequisito nombra una asignatura repetida', async () => {
    const base = baseEnMemoria();
    await expect(
      sembrar(
        base.tx,
        plan([
          {
            semestre: 5,
            nombre: 'Formación humana',
            codigo_interno: 'A1',
            raps: [],
          },
          {
            semestre: 7,
            nombre: 'Formación humana',
            codigo_interno: 'A2',
            raps: [],
          },
          {
            semestre: 8,
            nombre: 'Ética profesional',
            codigo_interno: 'A3',
            creditos: 2,
            raps: [],
            ficha: ficha(['Formación humana']),
          },
        ]),
      ),
    ).rejects.toThrow(
      'El prerrequisito «Formación humana» de «Ética profesional» es ambiguo: el plan P1 tiene 2 asignaturas con ese nombre.',
    );
    expect(base.requisitos.size).toBe(0);
  });

  it('falla con un mensaje claro si un prerrequisito no está en el plan', async () => {
    const base = baseEnMemoria();
    await expect(
      sembrar(
        base.tx,
        plan([
          {
            semestre: 8,
            nombre: 'Ética profesional',
            codigo_interno: 'A3',
            creditos: 2,
            raps: [],
            ficha: ficha(['Humanidades III']),
          },
        ]),
      ),
    ).rejects.toThrow(
      'No se encontró «Humanidades III», prerrequisito de «Ética profesional», en el plan P1.',
    );
  });
});
