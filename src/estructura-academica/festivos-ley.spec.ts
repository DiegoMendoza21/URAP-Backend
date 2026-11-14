import { FESTIVOS_2026 } from '../datos-iniciales/catalogos.js';
import { domingoDePascua, festivosDeLey } from './festivos-ley.js';

describe('festivos de ley (Ley 51 de 1983, HU-08-01)', () => {
  it('calcula el Domingo de Pascua', () => {
    expect(domingoDePascua(2024).toISOString().slice(0, 10)).toBe('2024-03-31');
    expect(domingoDePascua(2026).toISOString().slice(0, 10)).toBe('2026-04-05');
    expect(domingoDePascua(2027).toISOString().slice(0, 10)).toBe('2027-03-28');
    expect(domingoDePascua(2038).toISOString().slice(0, 10)).toBe('2038-04-25');
  });

  it('coincide con los festivos de 2026 que carga la siembra', () => {
    expect(festivosDeLey(2026)).toEqual(
      [...FESTIVOS_2026].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    );
  });

  it('traslada al lunes los que no caen en lunes y deja los fijos donde caen (2027)', () => {
    const fechas = Object.fromEntries(
      festivosDeLey(2027).map((festivo) => [festivo.nombre, festivo.fecha]),
    );
    expect(fechas).toEqual({
      'Año Nuevo': '2027-01-01',
      'Día de los Reyes Magos': '2027-01-11',
      'Día de San José': '2027-03-22',
      'Jueves Santo': '2027-03-25',
      'Viernes Santo': '2027-03-26',
      'Día del Trabajo': '2027-05-01',
      'Ascensión del Señor': '2027-05-10',
      'Corpus Christi': '2027-05-31',
      'Sagrado Corazón de Jesús': '2027-06-07',
      'San Pedro y San Pablo': '2027-07-05',
      'Día de la Independencia': '2027-07-20',
      'Batalla de Boyacá': '2027-08-07',
      'Asunción de la Virgen': '2027-08-16',
      'Día de la Raza': '2027-10-18',
      // El 1 de noviembre de 2027 es lunes: no se mueve.
      'Día de Todos los Santos': '2027-11-01',
      'Independencia de Cartagena': '2027-11-15',
      'Día de la Inmaculada Concepción': '2027-12-08',
      Navidad: '2027-12-25',
    });
  });

  it('son 18 por año, en fechas distintas', () => {
    for (const anio of [2026, 2027, 2028, 2029]) {
      const festivos = festivosDeLey(anio);
      expect(festivos).toHaveLength(18);
      expect(new Set(festivos.map((festivo) => festivo.fecha)).size).toBe(18);
      expect(
        festivos.every((festivo) => festivo.fecha.startsWith(`${anio}-`)),
      ).toBe(true);
    }
  });

  it('junta en un día los que caen en el mismo lunes (2025 y 2030)', () => {
    expect(festivosDeLey(2030)).toContainEqual({
      fecha: '2030-07-01',
      nombre: 'San Pedro y San Pablo y Sagrado Corazón de Jesús',
    });
    const festivos = festivosDeLey(2025);
    expect(festivos).toHaveLength(17);
    expect(festivos).toContainEqual({
      fecha: '2025-06-30',
      nombre: 'San Pedro y San Pablo y Sagrado Corazón de Jesús',
    });
  });
});
