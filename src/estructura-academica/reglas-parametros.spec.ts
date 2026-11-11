import { BadRequestException } from '@nestjs/common';
import { PARAMETRO } from '../common/parametros/parametros.service.js';
import { RANGO_PARAMETRO } from '../common/parametros/rangos-parametros.js';
import { PARAMETROS } from '../datos-iniciales/catalogos.js';
import { RANGO_EXPORTACION_MAXIMA } from '../reportes/seguimiento.service.js';
import { RANGO_UMBRAL_ALERTA } from '../sesiones/alertas.js';
import { DESCRIPCION_TOPE_TECNICO } from '../proyectos-docentes/dto/diligenciamiento.dto.js';
import {
  CLAVES_PARAMETRO,
  DEFINICION_PARAMETRO,
  elementosDe,
  type EntradaParametro,
  esClaveParametro,
  LONGITUD_MAXIMA_VALOR,
  MENSAJE_ELEMENTO_VACIO,
  MENSAJE_FALTA_VALOR,
  MENSAJE_FALTAN_ELEMENTOS,
  MENSAJE_LISTA_VACIA,
  MENSAJE_NO_ES_ENTERO,
  MENSAJE_NO_ES_LISTA,
  MENSAJE_NO_ES_SI_NO,
  mensajeElementoConComa,
  mensajeElementoRepetido,
  mensajeExtensionInvalida,
  mensajeFueraDeRango,
  mensajeValorLargo,
  validarValor,
} from './reglas-parametros.js';

const validar = (clave: keyof typeof PARAMETRO, entrada: EntradaParametro) =>
  validarValor(DEFINICION_PARAMETRO[PARAMETRO[clave]], entrada);

/** Espera un 400 con ese mensaje exacto. */
function rechaza(operacion: () => unknown, mensaje: string | RegExp): void {
  try {
    operacion();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    if (typeof mensaje === 'string') {
      expect((error as BadRequestException).message).toBe(mensaje);
    } else {
      expect((error as BadRequestException).message).toMatch(mensaje);
    }
    return;
  }
  throw new Error('Se esperaba un 400 y el valor se aceptó.');
}

describe('Reglas de los parámetros del sistema (HU-03-07)', () => {
  describe('el catálogo de parámetros editables', () => {
    it('define cada parámetro sembrado con el mismo tipo de dato', () => {
      expect([...CLAVES_PARAMETRO].sort()).toEqual(
        PARAMETROS.map(({ clave }) => clave).sort(),
      );
      for (const { clave, tipo_dato } of PARAMETROS) {
        expect(esClaveParametro(clave)).toBe(true);
        expect(
          DEFINICION_PARAMETRO[clave as keyof typeof DEFINICION_PARAMETRO].tipo,
        ).toBe(tipo_dato);
      }
    });

    it('acepta el valor inicial de cada parámetro sembrado', () => {
      for (const { clave, valor, tipo_dato } of PARAMETROS) {
        const definicion =
          DEFINICION_PARAMETRO[clave as keyof typeof DEFINICION_PARAMETRO];
        const entrada =
          tipo_dato === 'lista'
            ? { elementos: elementosDe(definicion, valor) }
            : { valor };
        expect(validarValor(definicion, entrada)).toBe(valor);
      }
    });

    // NFR-003: son variables de entorno, no parámetros editables desde la aplicación.
    it('no incluye el secreto ni la vigencia del JWT', () => {
      for (const clave of CLAVES_PARAMETRO) {
        expect(clave).not.toMatch(/jwt|token|secret|vigencia|expiracion/i);
      }
      for (const clave of [
        'jwt_secreto',
        'jwt_expiracion_minutos',
        'JWT_SECRETO',
        'JWT_EXPIRACION_MINUTOS',
      ]) {
        expect(esClaveParametro(clave)).toBe(false);
      }
    });

    it('no toma por parámetro una propiedad heredada de los objetos', () => {
      for (const clave of ['constructor', 'toString', '__proto__', '']) {
        expect(esClaveParametro(clave)).toBe(false);
      }
    });

    it('usa el mismo rango que quien lee el parámetro', () => {
      expect(RANGO_UMBRAL_ALERTA).toBe(
        RANGO_PARAMETRO[PARAMETRO.alertaDiasAnticipacion],
      );
      expect(RANGO_EXPORTACION_MAXIMA).toBe(
        RANGO_PARAMETRO[PARAMETRO.reporteExportacionFilasMaxima],
      );
      expect(DESCRIPCION_TOPE_TECNICO).toBe(
        RANGO_PARAMETRO[PARAMETRO.descripcionCursoLongitudMaxima].maximo,
      );
      for (const [clave, rango] of Object.entries(RANGO_PARAMETRO)) {
        expect(
          DEFINICION_PARAMETRO[clave as keyof typeof RANGO_PARAMETRO],
        ).toEqual({ tipo: 'entero', rango });
      }
    });
  });

  describe('enteros', () => {
    it.each([
      ['2', '2'],
      [' 7 ', '7'],
      ['007', '7'],
      ['0', '0'],
      ['365', '365'],
    ])('acepta «%s» y guarda «%s»', (valor, guardado) => {
      expect(validar('alertaDiasAnticipacion', { valor })).toBe(guardado);
    });

    it.each(['dos', '2.5', '2,5', '-1', '+2', '1e2', '2 días', '0x10'])(
      'rechaza «%s» porque no es un entero',
      (valor) => {
        rechaza(
          () => validar('alertaDiasAnticipacion', { valor }),
          MENSAJE_NO_ES_ENTERO,
        );
      },
    );

    it.each([
      ['alertaDiasAnticipacion', '366'],
      ['inicioSesionIntentosMaximos', '0'],
      ['inicioSesionIntentosMaximos', '101'],
      ['inicioSesionMinutosBloqueo', '0'],
      ['inicioSesionMinutosBloqueo', '1441'],
      ['archivoTamanoMaximoMb', '0'],
      ['archivoTamanoMaximoMb', '51'],
      ['descripcionCursoLongitudMaxima', '16001'],
      ['reporteExportacionFilasMaxima', '1000001'],
      ['reporteExportacionFilasMaxima', '99999999999999999999999'],
    ] as const)('rechaza %s = %s por estar fuera del rango', (clave, valor) => {
      rechaza(
        () => validar(clave, { valor }),
        mensajeFueraDeRango(RANGO_PARAMETRO[PARAMETRO[clave]]),
      );
    });

    it('dice el rango con separador de miles', () => {
      expect(
        mensajeFueraDeRango(
          RANGO_PARAMETRO[PARAMETRO.reporteExportacionFilasMaxima],
        ),
      ).toBe('El valor debe estar entre 1 y 1.000.000.');
    });

    it.each([{}, { valor: '' }, { valor: '   ' }])(
      'rechaza el valor vacío (%o)',
      (entrada) => {
        rechaza(
          () => validar('alertaDiasAnticipacion', entrada),
          MENSAJE_FALTA_VALOR,
        );
      },
    );

    it('rechaza una lista donde va un número', () => {
      rechaza(
        () => validar('alertaDiasAnticipacion', { elementos: ['2'] }),
        MENSAJE_NO_ES_LISTA,
      );
    });
  });

  describe('sí o no', () => {
    it.each([
      ['si', 'si'],
      ['no', 'no'],
      ['Sí', 'si'],
      [' NO ', 'no'],
    ])('acepta «%s» y guarda «%s»', (valor, guardado) => {
      expect(validar('revisionBloquearAutoaprobacion', { valor })).toBe(
        guardado,
      );
    });

    it.each(['true', '1', 'tal vez', 'sino'])('rechaza «%s»', (valor) => {
      rechaza(
        () => validar('revisionBloquearAutoaprobacion', { valor }),
        MENSAJE_NO_ES_SI_NO,
      );
    });
  });

  describe('listas', () => {
    it('guarda los nombres en su orden, con las mayúsculas y las tildes, separados por coma', () => {
      expect(
        validar('catalogoEstrategiasEnsenanza', {
          elementos: ['  Lluvia   de ideas ', 'Matriz C-Q-A', 'Resúmenes'],
        }),
      ).toBe('Lluvia de ideas, Matriz C-Q-A, Resúmenes');
    });

    it('acepta el catálogo de estrategias vacío: el punto 4 sigue sin sugerencias', () => {
      expect(validar('catalogoEstrategiasAprendizaje', { elementos: [] })).toBe(
        '',
      );
    });

    it('rechaza un valor suelto donde va una lista', () => {
      rechaza(
        () => validar('archivoTiposPermitidos', { valor: 'pdf' }),
        MENSAJE_FALTAN_ELEMENTOS,
      );
      rechaza(
        () => validar('archivoTiposPermitidos', {}),
        MENSAJE_FALTAN_ELEMENTOS,
      );
    });

    it.each([[['Portafolio', '']], [['Portafolio', '   ']]])(
      'rechaza un elemento vacío (%j)',
      (elementos) => {
        rechaza(
          () => validar('catalogoEstrategiasAprendizaje', { elementos }),
          MENSAJE_ELEMENTO_VACIO,
        );
      },
    );

    it.each([
      [['Portafolio', 'Ideograma', 'Portafolio'], 'Portafolio'],
      [['Resúmenes', 'resumenes'], 'resumenes'],
      [['Lluvia de ideas', 'LLUVIA  DE IDEAS'], 'LLUVIA DE IDEAS'],
    ])('rechaza un elemento repetido (%j)', (elementos, repetido) => {
      rechaza(
        () => validar('catalogoEstrategiasAprendizaje', { elementos }),
        mensajeElementoRepetido(repetido),
      );
    });

    it('no confunde la eñe con la ene', () => {
      expect(
        validar('catalogoEstrategiasAprendizaje', {
          elementos: ['Caña', 'Cana'],
        }),
      ).toBe('Caña, Cana');
    });

    it('rechaza un elemento con coma, que partiría la lista', () => {
      rechaza(
        () =>
          validar('catalogoEstrategiasAprendizaje', {
            elementos: ['Lectura, escritura'],
          }),
        mensajeElementoConComa('Lectura, escritura'),
      );
    });

    it('acepta una lista que ocupa justo los 255 caracteres y rechaza la que se pasa', () => {
      // 50 nombres de 3 letras con «, » entre ellos: 50 × 3 + 49 × 2 = 248; más uno de 5 = 255.
      const nombres = Array.from(
        { length: 50 },
        (_, indice) => `a${String(indice).padStart(2, '0')}`,
      );
      const justa = [...nombres, 'bcdef'];
      const guardado = validar('catalogoEstrategiasEnsenanza', {
        elementos: justa,
      });
      expect(guardado).toHaveLength(LONGITUD_MAXIMA_VALOR);

      rechaza(
        () =>
          validar('catalogoEstrategiasEnsenanza', {
            elementos: [...nombres, 'bcdefg'],
          }),
        mensajeValorLargo(LONGITUD_MAXIMA_VALOR + 1),
      );
    });
  });

  describe('tipos de archivo', () => {
    it('guarda las extensiones en minúscula, sin el punto y sin espacios', () => {
      expect(
        validar('archivoTiposPermitidos', {
          elementos: ['.JPG', ' png ', 'Pdf', 'xlsx', 'docx'],
        }),
      ).toBe('jpg,png,pdf,xlsx,docx');
    });

    it.each(['archivoTiposPermitidos', 'evidenciaTiposPermitidos'] as const)(
      '%s no puede quedar vacío',
      (clave) => {
        rechaza(() => validar(clave, { elementos: [] }), MENSAJE_LISTA_VACIA);
      },
    );

    it.each(['*.pdf', 'doc x', 'jpg/png', 'unaextensionlarguisima'])(
      'rechaza «%s» porque no es una extensión',
      (extension) => {
        rechaza(
          () =>
            validar('archivoTiposPermitidos', {
              elementos: ['pdf', extension],
            }),
          mensajeExtensionInvalida(extension),
        );
      },
    );

    it('rechaza la misma extensión dos veces, aunque cambie la forma de escribirla', () => {
      rechaza(
        () => validar('archivoTiposPermitidos', { elementos: ['pdf', '.PDF'] }),
        mensajeElementoRepetido('pdf'),
      );
    });

    it('las evidencias solo admiten los tipos que el sistema sabe verificar', () => {
      expect(
        validar('evidenciaTiposPermitidos', {
          elementos: ['jpg', 'jpeg', 'png', 'pdf'],
        }),
      ).toBe('jpg,jpeg,png,pdf');
      rechaza(
        () =>
          validar('evidenciaTiposPermitidos', { elementos: ['jpg', 'docx'] }),
        /^El sistema no sabe verificar archivos «docx»\. Los tipos disponibles son: jpg, jpeg, png, pdf\.$/,
      );
    });
  });

  describe('elementosDe', () => {
    it('separa el valor guardado de una lista y deja vacío lo que no lo es', () => {
      const lista = DEFINICION_PARAMETRO[PARAMETRO.archivoTiposPermitidos];
      const entero = DEFINICION_PARAMETRO[PARAMETRO.alertaDiasAnticipacion];
      expect(elementosDe(lista, 'jpg, png,,pdf')).toEqual([
        'jpg',
        'png',
        'pdf',
      ]);
      expect(elementosDe(lista, null)).toEqual([]);
      expect(elementosDe(entero, '2')).toEqual([]);
    });
  });
});
