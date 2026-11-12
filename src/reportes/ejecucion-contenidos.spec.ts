import {
  ejecucionDelCurso,
  semanasTerminadas,
  type SesionCalendario,
  type TemaMarcado,
  type TemaPlaneado,
} from './ejecucion-contenidos.js';

const HOY = '2026-09-16';

/** Semana n: lunes y miércoles, empezando el 3 de agosto de 2026 (semana 1). */
function calendario(semanas: number): SesionCalendario[] {
  return Array.from({ length: semanas }, (_, indice) => {
    const lunes = new Date(Date.UTC(2026, 7, 3 + indice * 7));
    const miercoles = new Date(lunes.getTime() + 2 * 86_400_000);
    return [lunes, miercoles].map((fecha) => ({
      semana: indice + 1,
      fecha: fecha.toISOString().slice(0, 10),
    }));
  }).flat();
}

const plan = (temas: (string | null)[]): TemaPlaneado[] =>
  temas.map((tema, indice) => ({
    idContenido: 100 + indice,
    semana: indice + 1,
    tema,
  }));

const marca = (
  idContenido: number | null,
  fecha: string | null,
  temaAdicional: string | null = null,
): TemaMarcado => ({ idContenido, fecha, temaAdicional });

describe('Ejecución de contenidos (RF-28, HU-12-04)', () => {
  describe('semanasTerminadas', () => {
    it('da por terminada la semana cuya última sesión ya pasó, no la de hoy', () => {
      // 16 de septiembre: miércoles de la semana 7.
      expect(
        [...semanasTerminadas(calendario(8), HOY)].sort((a, b) => a - b),
      ).toEqual([1, 2, 3, 4, 5, 6]);
      expect(
        semanasTerminadas([{ semana: 1, fecha: '2026-09-15' }], HOY).has(1),
      ).toBe(true);
      expect(semanasTerminadas([{ semana: 1, fecha: HOY }], HOY).has(1)).toBe(
        false,
      );
    });

    it('ignora sesiones sin semana o sin fecha', () => {
      expect(
        semanasTerminadas(
          [
            { semana: null, fecha: '2026-08-01' },
            { semana: 2, fecha: null },
          ],
          HOY,
        ).size,
      ).toBe(0);
    });
  });

  describe('ejecucionDelCurso', () => {
    it('separa dictados, no dictados y por dictar, y calcula el porcentaje sobre lo planeado', () => {
      const planeados = plan([
        'Introducción',
        'Capital de trabajo',
        'Flujo de caja',
        'Presupuesto',
        'Crédito',
        'Inventarios',
        'Tesorería',
        'Cierre',
      ]);
      const marcados = [
        marca(100, '2026-08-03'),
        marca(100, '2026-08-05'),
        marca(101, '2026-08-10'),
        // Un tema dictado fuera de su semana sigue siendo dictado.
        marca(105, '2026-08-19'),
      ];

      const resultado = ejecucionDelCurso(
        planeados,
        marcados,
        calendario(8),
        HOY,
      );

      expect(resultado).toMatchObject({
        planeados: 8,
        dictados: 3,
        // Semanas 3, 4 y 5 ya terminaron sin su tema.
        noDictados: 3,
        // Semana 7 (en curso) y 8 (futura).
        porDictar: 2,
        adicionales: 0,
        porcentajeDictados: 37.5,
      });
      expect(
        resultado.temas.map(({ semana, estado }) => [semana, estado]),
      ).toEqual([
        [1, 'dictado'],
        [2, 'dictado'],
        [3, 'no_dictado'],
        [4, 'no_dictado'],
        [5, 'no_dictado'],
        [6, 'dictado'],
        [7, 'por_dictar'],
        [8, 'por_dictar'],
      ]);
      expect(resultado.temas[0].fechas).toEqual(['2026-08-03', '2026-08-05']);
    });

    it('no cuenta como planeada una semana sin tema', () => {
      const resultado = ejecucionDelCurso(
        plan(['Introducción', null, '   ', 'Presupuesto']),
        [],
        calendario(4),
        HOY,
      );
      expect(resultado.planeados).toBe(2);
      expect(resultado.temas.map((tema) => tema.tema)).toEqual([
        'Introducción',
        'Presupuesto',
      ]);
    });

    it('un curso sin clases registradas: nada dictado, y lo vencido es no dictado', () => {
      const resultado = ejecucionDelCurso(
        plan(['Uno', 'Dos', 'Tres']),
        [],
        calendario(2),
        HOY,
      );
      expect(resultado).toMatchObject({
        planeados: 3,
        dictados: 0,
        noDictados: 2,
        // La semana 3 no tiene sesiones en el calendario: no se da por terminada.
        porDictar: 1,
        porcentajeDictados: 0,
      });
    });

    it('un curso sin calendario ni clases: todo queda por dictar', () => {
      const resultado = ejecucionDelCurso(plan(['Uno', 'Dos']), [], [], HOY);
      expect(resultado).toMatchObject({
        dictados: 0,
        noDictados: 0,
        porDictar: 2,
      });
    });

    it('un curso sin contenido programático no tiene porcentaje', () => {
      expect(ejecucionDelCurso([], [], calendario(3), HOY)).toMatchObject({
        planeados: 0,
        porcentajeDictados: null,
        temas: [],
      });
    });

    it('cuenta los temas adicionales aparte, agrupados por texto, sin sumarlos a lo planeado', () => {
      const resultado = ejecucionDelCurso(
        plan(['Introducción']),
        [
          marca(100, '2026-08-03'),
          marca(null, '2026-08-12', 'Charla invitada'),
          marca(null, '2026-08-05', '  charla   invitada '),
          marca(null, '2026-08-19', 'Simulacro'),
          marca(null, '2026-08-20', '   '),
        ],
        calendario(3),
        HOY,
      );
      expect(resultado).toMatchObject({
        planeados: 1,
        dictados: 1,
        adicionales: 2,
        porcentajeDictados: 100,
      });
      expect(resultado.temasAdicionales).toEqual([
        // Se conserva la primera forma en que se escribió.
        { tema: 'Charla invitada', fechas: ['2026-08-05', '2026-08-12'] },
        { tema: 'Simulacro', fechas: ['2026-08-19'] },
      ]);
    });

    it('un tema marcado en una clase sin fecha cuenta como dictado', () => {
      const resultado = ejecucionDelCurso(
        plan(['Uno']),
        [marca(100, null)],
        calendario(1),
        HOY,
      );
      expect(resultado.temas[0]).toEqual({
        semana: 1,
        tema: 'Uno',
        estado: 'dictado',
        fechas: [],
      });
    });
  });
});
