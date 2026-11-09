import {
  ESTADOS_PROYECTO,
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
    ['asignaturas del plan 2502', PLAN_2502.map(({ nombre }) => nombre)],
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
      ['2502', 36],
    ]);
  });

  it('trae las 69 asignaturas del plan 1702 en los semestres I a X', () => {
    const semestres = new Set(PLAN_1702.map(({ semestre }) => semestre));
    expect([...semestres].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it('trae las 36 asignaturas del plan 2502 en los semestres 1 a 5, con código y créditos', () => {
    const semestres = new Set(PLAN_2502.map(({ semestre }) => semestre));
    expect([...semestres].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    for (const { codigo_interno, creditos } of PLAN_2502) {
      expect(codigo_interno).toEqual(expect.any(String));
      expect(creditos).toBeGreaterThan(0);
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

  it('solo pone prerrequisitos que están en el mismo plan (HU-03-04)', () => {
    for (const { asignaturas } of PLANES_DE_ESTUDIO) {
      const nombres = asignaturas.map(({ nombre }) => nombre);
      for (const { ficha } of asignaturas) {
        expect(nombres).toEqual(
          expect.arrayContaining(ficha?.prerrequisitos ?? []),
        );
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
