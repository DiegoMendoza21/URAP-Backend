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
import { USUARIOS_DEMO } from './demostracion.js';
import { ESCALA, PLAN_DE_ESTUDIOS, RAPS } from './programa.js';

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
    ['asignaturas', PLAN_DE_ESTUDIOS.map(({ nombre }) => nombre)],
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

  it('trae las 69 asignaturas del plan de estudios en los semestres I a X', () => {
    expect(PLAN_DE_ESTUDIOS).toHaveLength(69);
    const semestres = new Set(PLAN_DE_ESTUDIOS.map(({ semestre }) => semestre));
    expect([...semestres].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it('trae los 73 vínculos asignatura–RAP del informe 2023-II', () => {
    const vinculos = PLAN_DE_ESTUDIOS.flatMap(({ raps }) => raps);
    expect(vinculos).toHaveLength(73);
    const porRap = RAPS.map(
      ({ numero }) => vinculos.filter((rap) => rap === numero).length,
    );
    expect(porRap).toEqual([7, 8, 16, 18, 3, 5, 16]);
  });

  it('vincula cada asignatura con al menos un RAP, sin repetirlo', () => {
    for (const { raps } of PLAN_DE_ESTUDIOS) {
      expect(raps.length).toBeGreaterThan(0);
      expect(repetidos(raps)).toEqual([]);
    }
  });

  it('relaciona las asignaturas solo con RAP que existen', () => {
    const numeros = RAPS.map(({ numero }) => numero);
    for (const { raps } of PLAN_DE_ESTUDIOS) {
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
