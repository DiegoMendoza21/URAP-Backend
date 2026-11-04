import {
  type ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import type { RespuestaErrorDto } from '../dto/respuesta-error.dto.js';
import { FiltroExcepciones } from './filtro-excepciones.js';

function crearHost(ruta = '/api/prueba') {
  const respuesta = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const peticion = { method: 'GET', url: ruta, originalUrl: ruta };
  const host = {
    switchToHttp: () => ({
      getRequest: () => peticion,
      getResponse: () => respuesta,
    }),
  } as unknown as ArgumentsHost;

  const cuerpo = (): RespuestaErrorDto =>
    respuesta.json.mock.calls[0][0] as RespuestaErrorDto;
  return { host, respuesta, cuerpo };
}

describe('FiltroExcepciones', () => {
  const filtro = new FiltroExcepciones();
  let registrarError: ReturnType<typeof vi.spyOn>;
  let registrarAdvertencia: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    registrarError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    registrarAdvertencia = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('conserva el mensaje en español de una excepción de negocio', () => {
    const { host, respuesta, cuerpo } = crearHost('/api/usuarios');

    filtro.catch(
      new ConflictException('Ya existe un usuario con ese correo.'),
      host,
    );

    expect(respuesta.status).toHaveBeenCalledWith(409);
    expect(cuerpo()).toMatchObject({
      estado: 409,
      error: 'Conflicto',
      mensaje: 'Ya existe un usuario con ese correo.',
      ruta: '/api/usuarios',
    });
    expect(cuerpo().fecha).toEqual(expect.any(String));
  });

  it('reemplaza el mensaje en inglés de una ruta inexistente', () => {
    const { host, cuerpo } = crearHost('/api/no-existe');

    filtro.catch(new NotFoundException('Cannot GET /api/no-existe'), host);

    expect(cuerpo()).toMatchObject({
      estado: 404,
      mensaje: 'El recurso solicitado no existe.',
    });
  });

  it('reemplaza el mensaje por defecto de un guard que rechaza', () => {
    const { host, cuerpo } = crearHost();

    filtro.catch(new ForbiddenException('Forbidden resource'), host);

    expect(cuerpo()).toMatchObject({
      estado: 403,
      mensaje: 'No tiene permiso para realizar esta acción.',
    });
  });

  it('usa el texto genérico cuando la excepción no trae mensaje propio', () => {
    const { host, cuerpo } = crearHost();

    filtro.catch(new UnauthorizedException(), host);

    expect(cuerpo()).toMatchObject({
      estado: 401,
      mensaje: 'Debe iniciar sesión para continuar.',
    });
  });

  it('incluye el detalle por campo de los errores de validación', () => {
    const { host, cuerpo } = crearHost();

    filtro.catch(
      new BadRequestException({
        mensaje: 'Los datos enviados no son válidos.',
        detalles: ['El correo institucional no es válido.'],
      }),
      host,
    );

    expect(cuerpo()).toMatchObject({
      estado: 400,
      mensaje: 'Los datos enviados no son válidos.',
      detalles: ['El correo institucional no es válido.'],
    });
  });

  it('traduce una violación de unicidad de Prisma sin exponer la restricción', () => {
    const { host, cuerpo } = crearHost();
    const error = new PrismaClientKnownRequestError(
      'Unique constraint failed on the constraint: `usuario_email_key`',
      {
        code: 'P2002',
        clientVersion: '7.10.1',
        meta: { target: 'usuario_email_key' },
      },
    );

    filtro.catch(error, host);

    expect(cuerpo()).toMatchObject({
      estado: 409,
      mensaje: 'Ya existe un registro con esos datos.',
    });
    expect(JSON.stringify(cuerpo())).not.toContain('usuario_email_key');
  });

  it('responde 500 genérico ante un error inesperado y lo deja en el registro técnico', () => {
    const { host, cuerpo } = crearHost();
    const error = new Error("Unknown column 'usuario.clave' in 'field list'");

    filtro.catch(error, host);

    expect(cuerpo()).toMatchObject({
      estado: 500,
      error: 'Error interno',
      mensaje: 'Ocurrió un error inesperado. Intente de nuevo más tarde.',
    });
    expect(JSON.stringify(cuerpo())).not.toContain('usuario');
    expect(registrarError).toHaveBeenCalledWith(
      expect.stringContaining('respondió 500'),
      expect.stringContaining('Unknown column'),
    );
  });

  it('respeta el estado de un error de middleware sin exponer su mensaje técnico', () => {
    const { host, cuerpo } = crearHost();
    const error = Object.assign(
      new SyntaxError('Unexpected token } in JSON at position 10'),
      {
        status: 400,
        type: 'entity.parse.failed',
      },
    );

    filtro.catch(error, host);

    expect(cuerpo()).toMatchObject({
      estado: 400,
      mensaje: 'La solicitud no es válida.',
    });
    expect(registrarError).not.toHaveBeenCalled();
  });

  // Así llega un cuerpo JSON mal formado: el adaptador de Express lo convierte en
  // BadRequestException con el mensaje del parser.
  it('reemplaza el mensaje del parser cuando el cuerpo JSON está mal formado', () => {
    const { host, cuerpo } = crearHost();

    filtro.catch(new BadRequestException('Unexpected end of JSON input'), host);

    expect(cuerpo()).toMatchObject({
      estado: 400,
      mensaje: 'La solicitud no es válida.',
    });
  });

  it('reemplaza el mensaje de un error de http-errors que envolvió el adaptador', () => {
    const { host, cuerpo } = crearHost();
    const causa = Object.assign(new Error('request entity too large'), {
      expose: true,
      status: 413,
      statusCode: 413,
    });

    filtro.catch(
      new HttpException('request entity too large', 413, { cause: causa }),
      host,
    );

    expect(cuerpo()).toMatchObject({
      estado: 413,
      error: 'Contenido demasiado grande',
      mensaje: 'El contenido enviado supera el tamaño permitido.',
    });
  });

  it('registra un 5xx lanzado a propósito en una sola línea, sin stack', () => {
    const { host, cuerpo } = crearHost('/api/salud');

    filtro.catch(
      new ServiceUnavailableException('La base de datos no está disponible.'),
      host,
    );

    expect(cuerpo()).toMatchObject({
      estado: 503,
      mensaje: 'La base de datos no está disponible.',
    });
    expect(registrarAdvertencia).toHaveBeenCalledWith(
      'GET /api/salud respondió 503: La base de datos no está disponible.',
    );
    expect(registrarError).not.toHaveBeenCalled();
  });
});
