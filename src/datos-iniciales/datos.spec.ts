import {
  PARAMETRO,
  separarTextos,
} from '../common/parametros/parametros.service.js';
import { primeraRepetida } from '../proyectos-docentes/entities/listas.js';
import {
  ESTADOS_PROYECTO,
  ESTRATEGIAS_APRENDIZAJE_MEN,
  ESTRATEGIAS_ENSENANZA_MEN,
  FESTIVOS_2026,
  MODULOS,
  PARAMETROS,
  PERMISOS,
  ROLES,
  TIPOS_NOTIFICACION,
  TIPOS_SESION,
} from './catalogos.js';
import {
  PERIODO,
  PREFIJO_PROVISIONAL,
  RECESO_2026_2,
  RUBRICAS_PROVISIONALES,
  USUARIOS_DEMO,
} from './demostracion.js';
import {
  ESCALA,
  HORAS_POR_CREDITO,
  PLAN_1702,
  PLAN_2502,
  PLANES_DE_ESTUDIO,
  RAPS,
  RUBRICA_RAP_2,
} from './programa.js';

const repetidos = (valores: unknown[]) =>
  valores.filter((valor, i) => valores.indexOf(valor) !== i);

describe('Datos iniciales', () => {
  it('trae los seis roles de RF-03', () => {
    expect(ROLES.map(({ nombre }) => nombre)).toEqual([
      'Administrador',
      'Departamento académico',
      'Docente responsable',
      'Líder RAP',
      'Dirección del programa',
      'Estudiante',
    ]);
  });

  it.each([
    ['módulos', MODULOS.map(({ codigo }) => codigo)],
    ['permisos', PERMISOS.map(({ codigo }) => codigo)],
    ['estados del proyecto', ESTADOS_PROYECTO.map(({ codigo }) => codigo)],
    ['tipos de sesión', TIPOS_SESION.map(({ codigo }) => codigo)],
    ['tipos de notificación', TIPOS_NOTIFICACION.map(({ codigo }) => codigo)],
    ['parámetros', PARAMETROS.map(({ clave }) => clave)],
    ['planes de estudio', PLANES_DE_ESTUDIO.map(({ codigo }) => codigo)],
    ['asignaturas del plan 1702', PLAN_1702.map(({ nombre }) => nombre)],
    [
      'códigos SMA del plan 1702',
      PLAN_1702.flatMap(({ codigo_interno }) => codigo_interno ?? []),
    ],
    [
      'códigos SMA del plan 2502',
      PLAN_2502.flatMap(({ codigo_interno }) => codigo_interno ?? []),
    ],
    ['usuarios de demostración', USUARIOS_DEMO.map(({ correo }) => correo)],
  ])('no repite códigos en %s', (_, codigos) => {
    expect(repetidos(codigos)).toEqual([]);
  });

  it('en el plan 2502 solo se repite un nombre: las cuatro «Formación humana», con códigos distintos', () => {
    // La malla del SMA trae cuatro asignaturas con ese nombre y no dice cuál es cuál. Cualquier
    // otro nombre repetido es una fila copiada por error.
    const nombres = PLAN_2502.map(({ nombre }) => nombre);
    expect([...new Set(repetidos(nombres))]).toEqual(['Formación humana']);
    expect(
      PLAN_2502.filter(({ nombre }) => nombre === 'Formación humana').map(
        ({ semestre, codigo_interno }) => [semestre, codigo_interno],
      ),
    ).toEqual([
      [5, 'FC72731'],
      [7, 'FC72737'],
      [7, 'FC72738'],
      [8, 'FC72739'],
    ]);
  });

  it('un nombre solo se repite dentro de un plan entre asignaturas con código', () => {
    // El sembrado busca por código a la que lo tiene y por nombre a la que no: una asignatura
    // sin código con un nombre repetido no se podría distinguir de la otra.
    for (const { asignaturas } of PLANES_DE_ESTUDIO) {
      const nombres = asignaturas.map(({ nombre }) => nombre);
      for (const { nombre, codigo_interno } of asignaturas) {
        if (nombres.filter((otro) => otro === nombre).length > 1) {
          expect(codigo_interno).toEqual(expect.any(String));
        }
      }
    }
  });

  it('solo deja editar el proyecto en diligenciamiento o devuelto (RF-17)', () => {
    expect(
      ESTADOS_PROYECTO.filter((estado) => estado.permite_edicion).map(
        ({ codigo }) => codigo,
      ),
    ).toEqual(['en_diligenciamiento', 'devuelto']);
  });

  it('solo exige tema en las sesiones de clase (RF-21)', () => {
    expect(
      TIPOS_SESION.filter((tipo) => tipo.exige_tema).map(
        ({ codigo }) => codigo,
      ),
    ).toEqual(['clase']);
  });

  it('trae los 18 festivos de 2026, en orden y sin repetir', () => {
    const fechas = FESTIVOS_2026.map(({ fecha }) => fecha);
    expect(fechas).toHaveLength(18);
    expect(repetidos(fechas)).toEqual([]);
    expect([...fechas].sort()).toEqual(fechas);
    for (const fecha of fechas) {
      const dia = new Date(`${fecha}T00:00:00Z`);
      expect(dia.toISOString().slice(0, 10)).toBe(fecha);
    }
  });

  it('trae los siete RAP del programa con su texto oficial (RF-05)', () => {
    expect(RAPS.map(({ numero }) => numero)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const { descripcion } of RAPS) {
      expect(descripcion.length).toBeGreaterThan(50);
      expect(descripcion).not.toMatch(/pendiente/i);
    }
  });

  it('trae los dos planes vigentes del programa, 1702 y 2502 (RF-04 v1.1)', () => {
    expect(
      PLANES_DE_ESTUDIO.map(({ codigo, asignaturas }) => [
        codigo,
        asignaturas.length,
      ]),
    ).toEqual([
      ['1702', 69],
      ['2502', 74],
    ]);
  });

  it('trae las 69 asignaturas del plan 1702 en los semestres I a X', () => {
    const semestres = new Set(PLAN_1702.map(({ semestre }) => semestre));
    expect([...semestres].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it('trae las 74 asignaturas del plan 2502 en los semestres 1 a 10, con código y créditos', () => {
    const semestres = new Set(PLAN_2502.map(({ semestre }) => semestre));
    expect([...semestres].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    for (const { codigo_interno, creditos } of PLAN_2502) {
      expect(codigo_interno).toEqual(expect.any(String));
      expect(creditos).toBeGreaterThan(0);
    }
  });

  it('cuadra los créditos del plan 2502 por semestre: 203 con las dos líneas de electivas', () => {
    const porSemestre = Array.from({ length: 10 }, (_, i) =>
      PLAN_2502.filter(({ semestre }) => semestre === i + 1).reduce(
        (suma, { creditos }) => suma + (creditos ?? 0),
        0,
      ),
    );
    expect(porSemestre).toEqual([19, 20, 19, 19, 19, 20, 19, 22, 30, 16]);
    expect(porSemestre.reduce((a, b) => a + b, 0)).toBe(203);
  });

  describe('asignaturas del plan 2502 que salen de la malla del SMA', () => {
    /** FC72731 del semestre 5 y los semestres 6 a 10 completos. */
    const deLaMalla = PLAN_2502.filter(
      ({ semestre, codigo_interno }) =>
        semestre >= 6 || codigo_interno === 'FC72731',
    );
    const conCodigo = (...codigos: string[]) =>
      PLAN_2502.filter(({ codigo_interno }) =>
        codigos.includes(codigo_interno ?? ''),
      );

    it('son 38, sin horas, sin prerrequisitos y sin mapeo a RAP', () => {
      expect(deLaMalla).toHaveLength(38);
      for (const { ficha, raps } of deLaMalla) {
        expect(ficha).toBeUndefined();
        expect(raps).toEqual([]);
      }
    });

    it('las de los semestres 1 a 5 que ya estaban no cambian', () => {
      const anteriores = PLAN_2502.filter((fila) => !deLaMalla.includes(fila));
      expect(anteriores).toHaveLength(36);
      // Sin formato diligenciado siguen sin componente ni tipo de curso.
      for (const { ficha, componente, tipo_curso } of anteriores) {
        if (!ficha) {
          expect(componente).toBeUndefined();
          expect(tipo_curso).toBeUndefined();
        }
      }
      expect(conCodigo('NC2505')[0]?.ficha?.componente).toBe('PROFESIONAL');
    });

    it('las electivas I a VII llevan el nombre de la malla y son de tipo «Electivo»', () => {
      const electivas = deLaMalla.filter(
        ({ tipo_curso }) => tipo_curso === 'Electivo',
      );
      expect(electivas.map(({ codigo_interno }) => codigo_interno)).toEqual(
        Array.from(
          { length: 14 },
          (_, i) => `IX242${String(7 + i).padStart(2, '0')}`,
        ),
      );
      for (const { nombre, creditos, componente } of electivas) {
        expect(nombre).toMatch(
          /^Electiva (I|II|III|IV|V|VI|VII) - (GA|GP|GPO)$/,
        );
        expect(creditos).toBe(3);
        expect(componente).toBe('PROFESIONAL');
      }
    });

    it('Electiva VIII va con su nombre, 5 créditos y sin componente ni tipo de curso', () => {
      expect(conCodigo('IX24221', 'IX24228')).toEqual([
        {
          semestre: 10,
          codigo_interno: 'IX24221',
          nombre: 'Electiva VIII - GA',
          creditos: 5,
          raps: [],
        },
        {
          semestre: 10,
          codigo_interno: 'IX24228',
          nombre: 'Electiva VIII - GP',
          creditos: 5,
          raps: [],
        },
      ]);
    });

    it('las cuatro «Formación humana» son complementarias y no llevan número', () => {
      const formacion = conCodigo('FC72731', 'FC72737', 'FC72738', 'FC72739');
      expect(formacion).toHaveLength(4);
      for (const { nombre, creditos, componente, tipo_curso } of formacion) {
        expect(nombre).toBe('Formación humana');
        expect(creditos).toBe(2);
        expect(componente).toBe('COMPLEMENTARIO');
        expect(tipo_curso).toBeUndefined();
      }
    });

    it('las demás traen el componente del plan de estudios público', () => {
      const componentes = new Map<string, number>();
      for (const { componente } of deLaMalla) {
        const clave = componente ?? 'sin componente';
        componentes.set(clave, (componentes.get(clave) ?? 0) + 1);
      }
      // 31 profesionales (17 obligatorias y 14 electivas), Inglés VI, cuatro de formación
      // humana y las dos Electiva VIII.
      expect(Object.fromEntries(componentes)).toEqual({
        PROFESIONAL: 31,
        BASICO: 1,
        COMPLEMENTARIO: 4,
        'sin componente': 2,
      });
      expect(conCodigo('FN24038')[0]).toMatchObject({
        nombre: 'Inglés VI',
        componente: 'BASICO',
      });
    });
  });

  it('una asignatura con ficha lleva el componente y el tipo de curso en la ficha, no fuera', () => {
    for (const { ficha, componente, tipo_curso } of [
      ...PLAN_1702,
      ...PLAN_2502,
    ]) {
      if (ficha) {
        expect(componente).toBeUndefined();
        expect(tipo_curso).toBeUndefined();
      }
    }
  });

  it('deja el plan 2502 sin mapeo a RAP mientras el programa no lo entregue (SUP-16)', () => {
    expect(PLAN_2502.flatMap(({ raps }) => raps)).toEqual([]);
  });

  it('trae los 73 vínculos asignatura–RAP del informe 2023-II', () => {
    const vinculos = PLAN_1702.flatMap(({ raps }) => raps);
    expect(vinculos).toHaveLength(73);
    const porRap = RAPS.map(
      ({ numero }) => vinculos.filter((rap) => rap === numero).length,
    );
    expect(porRap).toEqual([7, 8, 16, 18, 3, 5, 16]);
  });

  it('vincula cada asignatura del plan 1702 con al menos un RAP, sin repetirlo', () => {
    for (const { raps } of PLAN_1702) {
      expect(raps.length).toBeGreaterThan(0);
      expect(repetidos(raps)).toEqual([]);
    }
  });

  it('relaciona las asignaturas solo con RAP que existen', () => {
    const numeros = RAPS.map(({ numero }) => numero);
    for (const { raps } of PLAN_1702) {
      expect(numeros).toEqual(expect.arrayContaining(raps));
    }
  });

  it('usa solo roles del catálogo en los usuarios de demostración', () => {
    const nombres: string[] = ROLES.map(({ nombre }) => nombre);
    for (const { roles } of USUARIOS_DEMO) {
      expect(nombres).toEqual(expect.arrayContaining(roles));
    }
    // Cada rol tiene al menos un usuario para probarlo.
    expect(USUARIOS_DEMO.flatMap(({ roles }) => roles)).toEqual(
      expect.arrayContaining(nombres),
    );
  });

  it('incluye un usuario con varios roles', () => {
    expect(USUARIOS_DEMO.some(({ roles }) => roles.length > 1)).toBe(true);
  });

  it('usa una escala de niveles consecutivos con umbral dentro de la escala (RF-07)', () => {
    expect(ESCALA.niveles.map(({ valor }) => valor)).toEqual([1, 2, 3, 4]);
    expect(ESCALA.umbral_cumplimiento).toBeLessThanOrEqual(
      ESCALA.niveles.length,
    );
  });

  it('no siembra parámetros de seguridad del despliegue (NFR-003)', () => {
    expect(
      PARAMETROS.filter(({ clave }) => /jwt|token|secreto/i.test(clave)),
    ).toEqual([]);
  });

  it('deja las descripciones de los parámetros dentro de su columna de 255 caracteres', () => {
    for (const { descripcion } of PARAMETROS) {
      expect(descripcion.length).toBeLessThanOrEqual(255);
    }
  });

  it('deja el valor de cada parámetro dentro de su columna de 255 caracteres', () => {
    const largos = PARAMETROS.filter(({ valor }) => valor.length > 255).map(
      ({ clave }) => clave,
    );
    expect(largos).toEqual([]);
  });

  it('trae el catálogo del MEN de RF-13: 9 estrategias de enseñanza y 4 de aprendizaje, sin comas', () => {
    expect(ESTRATEGIAS_ENSENANZA_MEN).toHaveLength(9);
    expect(ESTRATEGIAS_APRENDIZAJE_MEN).toHaveLength(4);
    const todas = [
      ...ESTRATEGIAS_ENSENANZA_MEN,
      ...ESTRATEGIAS_APRENDIZAJE_MEN,
    ];
    // La coma separa los nombres en el parámetro: un nombre con coma se partiría en dos.
    expect(todas.filter((nombre) => nombre.includes(','))).toEqual([]);
    expect(primeraRepetida(todas)).toBeNull();
    // Leídos como los lee el punto 4, los parámetros devuelven los mismos nombres.
    const valorDe = (clave: string) =>
      PARAMETROS.find((parametro) => parametro.clave === clave)?.valor ?? '';
    expect(
      separarTextos(valorDe(PARAMETRO.catalogoEstrategiasEnsenanza)),
    ).toEqual(ESTRATEGIAS_ENSENANZA_MEN);
    expect(
      separarTextos(valorDe(PARAMETRO.catalogoEstrategiasAprendizaje)),
    ).toEqual(ESTRATEGIAS_APRENDIZAJE_MEN);
  });
});

describe('Datos institucionales de la versión 2 del documento', () => {
  it('genera los dieciséis descriptores de la rúbrica real del RAP 2 (RF-06)', () => {
    expect(RUBRICA_RAP_2).toMatchObject({ rap: 2, version: 1 });
    expect(
      RUBRICA_RAP_2.indicadores.flatMap(({ numero, descriptores }) =>
        descriptores.map(({ nivel, descripcion }) => [
          numero,
          nivel,
          descripcion,
        ]),
      ),
    ).toEqual([
      [
        1,
        1,
        'No identifica las variables del entorno económico y financiero de las organizaciones',
      ],
      [
        1,
        2,
        'Raras veces identifica las variables del entorno económico y financiero de las organizaciones',
      ],
      [
        1,
        3,
        'Frecuentemente identifica las variables del entorno económico y financiero de las organizaciones',
      ],
      [
        1,
        4,
        'Siempre identifica las variables del entorno económico y financiero de las organizaciones',
      ],
      [
        2,
        1,
        'No interpreta las variables del entorno económico y financiero que inciden en las organizaciones',
      ],
      [
        2,
        2,
        'Raras veces interpreta las variables del entorno económico y financiero que inciden en las organizaciones',
      ],
      [
        2,
        3,
        'Frecuentemente interpreta las variables del entorno económico y financiero que inciden en las organizaciones',
      ],
      [
        2,
        4,
        'Siempre interpreta las variables del entorno económico y financiero que inciden en las organizaciones',
      ],
      [
        3,
        1,
        'No aplica principios económicos y financieros para la definición de alternativas que contribuyan a la toma de decisiones gerenciales en las organizaciones',
      ],
      [
        3,
        2,
        'Raras veces aplica principios económicos y financieros para la definición de alternativas que contribuyan a la toma de decisiones gerenciales en las organizaciones',
      ],
      [
        3,
        3,
        'Frecuentemente aplica principios económicos y financieros para la definición de alternativas que contribuyan a la toma de decisiones gerenciales en las organizaciones',
      ],
      [
        3,
        4,
        'Siempre aplica principios económicos y financieros para la definición de alternativas que contribuyan a la toma de decisiones gerenciales en las organizaciones',
      ],
      [
        4,
        1,
        'No evalúa el entorno económico y financiero de las organizaciones a nivel local, nacional e internacional, a partir de las variables identificadas',
      ],
      [
        4,
        2,
        'Raras veces evalúa el entorno económico y financiero de las organizaciones a nivel local, nacional e internacional, a partir de las variables identificadas',
      ],
      [
        4,
        3,
        'Frecuentemente evalúa el entorno económico y financiero de las organizaciones a nivel local, nacional e internacional, a partir de las variables identificadas',
      ],
      [
        4,
        4,
        'Siempre evalúa el entorno económico y financiero de las organizaciones a nivel local, nacional e internacional, a partir de las variables identificadas',
      ],
    ]);
  });

  it('no marca como provisional la rúbrica real del RAP 2', () => {
    const textos = RUBRICA_RAP_2.indicadores.flatMap(
      ({ descripcion, descriptores }) => [
        descripcion,
        ...descriptores.map((descriptor) => descriptor.descripcion),
      ],
    );
    expect(textos.filter((texto) => texto.includes('PROVISIONAL'))).toEqual([]);
  });

  it('marca como provisionales las rúbricas de los RAP 1 y 3 a 7, con sus indicadores de 2023-II', () => {
    expect(
      RUBRICAS_PROVISIONALES.map(({ rap, indicadores }) => [
        rap,
        indicadores.length,
      ]),
    ).toEqual([
      [1, 4],
      [3, 4],
      [4, 4],
      [5, 3],
      [6, 3],
      [7, 3],
    ]);
    for (const { indicadores } of RUBRICAS_PROVISIONALES) {
      for (const { descripcion, descriptores } of indicadores) {
        expect(descripcion.startsWith(`${PREFIJO_PROVISIONAL} `)).toBe(true);
        expect(descriptores.map(({ nivel }) => nivel)).toEqual([1, 2, 3, 4]);
        for (const descriptor of descriptores) {
          expect(
            descriptor.descripcion.startsWith(`${PREFIJO_PROVISIONAL} `),
          ).toBe(true);
        }
      }
    }
  });

  it('usa las fechas del período 2026-2 del Acuerdo 46', () => {
    expect(PERIODO).toEqual({
      codigo: '2026-2',
      fecha_inicio: '2026-08-03',
      fecha_fin: '2026-11-27',
      numero_semanas: 16,
    });
  });

  it('marca los doce días sin clase del 2026-2 con su origen (RF-19)', () => {
    // Del inicio de clases al fin de los parciales finales, el 11 de diciembre. Los festivos
    // nacionales vienen de los datos base (origen ley); el receso, de la demostración.
    const nacionales = FESTIVOS_2026.filter(
      ({ fecha }) => fecha >= PERIODO.fecha_inicio && fecha <= '2026-12-11',
    ).map(({ fecha }) => [fecha, 'ley']);
    const receso = RECESO_2026_2.map(({ fecha }) => [fecha, 'institucional']);
    const dias = [...nacionales, ...receso].sort(([a], [b]) =>
      a.localeCompare(b),
    );

    expect(dias).toEqual([
      ['2026-08-07', 'ley'],
      ['2026-08-17', 'ley'],
      ['2026-10-12', 'ley'],
      ['2026-11-02', 'ley'],
      ['2026-11-09', 'institucional'],
      ['2026-11-10', 'institucional'],
      ['2026-11-11', 'institucional'],
      ['2026-11-12', 'institucional'],
      ['2026-11-13', 'institucional'],
      ['2026-11-14', 'institucional'],
      ['2026-11-16', 'ley'],
      ['2026-12-08', 'ley'],
    ]);
  });

  it('carga la ficha completa de las cinco asignaturas de los formatos FO-DO/PC-001', () => {
    const fichas = PLANES_DE_ESTUDIO.flatMap(({ codigo, asignaturas }) =>
      asignaturas
        .filter(({ ficha }) => ficha)
        .map(({ nombre, codigo_interno, creditos, ficha }) => ({
          plan: codigo,
          nombre,
          codigo_interno: codigo_interno ?? null,
          creditos: creditos ?? null,
          ...ficha,
        })),
    );
    const comunes = { componente: 'PROFESIONAL', tipo_curso: 'Obligatorio' };
    // Los dos formatos de Comportamiento organizacional son iguales salvo el código.
    const comportamiento = {
      nombre: 'Comportamiento organizacional',
      ...comunes,
      creditos: 2,
      horas_tde: 32,
      horas_tdp: 0,
      horas_ti: 64,
      prerrequisitos: ['Organización y dirección'],
    };
    expect(fichas).toEqual([
      { plan: '1702', codigo_interno: 'FP15503', ...comportamiento },
      {
        plan: '1702',
        nombre: 'Gestión ambiental',
        codigo_interno: 'FP15804',
        ...comunes,
        creditos: 2,
        horas_tde: 32,
        horas_tdp: 0,
        horas_ti: 64,
        prerrequisitos: [],
      },
      {
        plan: '2502',
        nombre: 'Fundamentos de administración',
        codigo_interno: 'NC2507',
        ...comunes,
        creditos: 3,
        horas_tde: 48,
        horas_tdp: 0,
        horas_ti: 96,
        prerrequisitos: [],
      },
      {
        plan: '2502',
        nombre: 'Fundamentos de investigación científica',
        codigo_interno: 'NC2505',
        ...comunes,
        creditos: 3,
        horas_tde: 48,
        horas_tdp: 0,
        horas_ti: 96,
        prerrequisitos: ['Producción y comprensión textual II'],
      },
      { plan: '2502', codigo_interno: 'IX24193', ...comportamiento },
    ]);
  });

  it('cuadra las horas de cada ficha con sus créditos (RF-04)', () => {
    for (const { creditos, ficha } of [...PLAN_1702, ...PLAN_2502]) {
      if (ficha) {
        expect(creditos).toBeDefined();
        expect(ficha.horas_tde + ficha.horas_tdp + ficha.horas_ti).toBe(
          (creditos ?? 0) * HORAS_POR_CREDITO,
        );
      }
    }
  });

  it('solo pone prerrequisitos que están en el mismo plan, una sola vez (HU-03-04)', () => {
    for (const { asignaturas } of PLANES_DE_ESTUDIO) {
      const nombres = asignaturas.map(({ nombre }) => nombre);
      for (const { ficha } of asignaturas) {
        for (const requerida of ficha?.prerrequisitos ?? []) {
          // Los prerrequisitos van por nombre: uno repetido en el plan sería ambiguo.
          expect(nombres.filter((nombre) => nombre === requerida)).toEqual([
            requerida,
          ]);
        }
      }
    }
  });

  it('trae Comportamiento organizacional en los dos planes, con distinto código (v2.5)', () => {
    const enCadaPlan = PLANES_DE_ESTUDIO.map(({ codigo, asignaturas }) => {
      const fila = asignaturas.find(
        ({ nombre }) => nombre === 'Comportamiento organizacional',
      );
      return [codigo, fila?.codigo_interno, fila?.semestre];
    });
    expect(enCadaPlan).toEqual([
      ['1702', 'FP15503', 5],
      ['2502', 'IX24193', 5],
    ]);
  });

  it('trae en el plan 1702 solo los códigos SMA de los semestres IV a X', () => {
    const conCodigo = PLAN_1702.filter(({ codigo_interno }) => codigo_interno);
    expect(conCodigo).toHaveLength(36);
    for (const { semestre } of conCodigo) {
      expect(semestre).toBeGreaterThanOrEqual(4);
    }
    // Finanzas a corto plazo trae el código del formato 023, pero no sus créditos.
    const finanzas = conCodigo.find(
      ({ nombre }) => nombre === 'Finanzas a corto plazo',
    );
    expect(finanzas?.codigo_interno).toBe('FP15502');
    expect(finanzas?.creditos).toBeUndefined();
    // Los créditos solo se conocen de las asignaturas que traen código.
    for (const { codigo_interno, creditos } of PLAN_1702) {
      if (creditos !== undefined) {
        expect(codigo_interno).toBeDefined();
      }
    }
  });
});
