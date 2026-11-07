import { auditarCambios } from './auditar-seccion.js';

describe('auditarCambios', () => {
  it('audita la lista cuando cambia', () => {
    expect(
      auditarCambios(
        'proyecto_docente',
        7,
        { bibliografia: ['A'] },
        { bibliografia: ['A', 'B'] },
      ),
    ).toEqual({
      accion: 'actualizar',
      tabla: 'proyecto_docente',
      idRegistro: 7,
      anterior: { bibliografia: ['A'] },
      nuevo: { bibliografia: ['A', 'B'] },
    });
  });

  it('nulo si se guardó la misma lista: no se audita ni se mueve la fecha', () => {
    expect(
      auditarCambios('rac', 3, { evaluacion: [] }, { evaluacion: [] }),
    ).toBeNull();
  });
});
