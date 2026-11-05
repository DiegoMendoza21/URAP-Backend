import { BadRequestException } from '@nestjs/common';
import { IsEmail } from 'class-validator';
import {
  crearPipeValidacion,
  MENSAJE_DATOS_INVALIDOS,
} from './pipe-validacion.js';

class DtoDePrueba {
  @IsEmail({}, { message: 'El correo institucional no es válido.' })
  correo: string;
}

const METADATOS = { type: 'body' as const, metatype: DtoDePrueba };

describe('crearPipeValidacion', () => {
  const pipe = crearPipeValidacion();

  it('rechaza datos inválidos con un mensaje general y el detalle por campo', async () => {
    const error: unknown = await pipe
      .transform({ correo: 'no-es-un-correo', rol: 'administrador' }, METADATOS)
      .catch((excepcion: unknown) => excepcion);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      mensaje: MENSAJE_DATOS_INVALIDOS,
      detalles: expect.arrayContaining([
        'El correo institucional no es válido.',
        'El campo «rol» no está permitido.',
      ]),
    });
  });

  it('deja pasar datos válidos convertidos en el DTO', async () => {
    const resultado: unknown = await pipe.transform(
      { correo: 'docente@ejemplo.edu.co' },
      METADATOS,
    );

    expect(resultado).toBeInstanceOf(DtoDePrueba);
  });
});
