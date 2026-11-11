import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { ejecutarEnContexto } from '../common/contexto/contexto-peticion.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import { type AuditoriaService, VALOR_OMITIDO } from './auditoria.service.js';
import {
  ConsultaAuditoriaService,
  ENTIDAD_CONSULTA_AUDITORIA,
  MENSAJE_FALTA_ENTIDAD,
  MENSAJE_RANGO_INVERTIDO,
  MENSAJE_REGISTRO_NO_EXISTE,
  MINUTOS_ENTRE_CONSTANCIAS,
} from './consulta-auditoria.service.js';
import type { ConsultarAuditoriaDto } from './dto/consultar-auditoria.dto.js';

describe('ConsultaAuditoriaService · HU-14-02 y HU-14-03', () => {
  const prisma = {
    auditoria: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  };
  const auditoria = { registrar: vi.fn() };
  let servicio: ConsultaAuditoriaService;

  const fila = {
    id: 40,
    fecha: new Date('2026-11-10T15:04:05.000Z'),
    accion: 'aprobar',
    tabla_afectada: 'proyecto_docente',
    id_registro: 12,
    ip: '10.0.0.9',
    valor_anterior: { estado: 'enviado' },
    valor_nuevo: { estado: 'aprobado', fechaAprobacion: '2026-11-10' },
    usuario: { id: 7, nombres: 'Usuario', apellidos: 'Ficticio' },
  };

  const consulta = (
    filtros: Partial<ConsultarAuditoriaDto> = {},
  ): ConsultarAuditoriaDto => ({ pagina: 1, tamano: 20, ...filtros });

  const argumentosDelListado = () =>
    prisma.auditoria.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      orderBy: unknown;
      skip: number;
      take: number;
    };

  beforeEach(() => {
    servicio = new ConsultaAuditoriaService(
      prisma as unknown as PrismaService,
      auditoria as unknown as AuditoriaService,
    );
    prisma.auditoria.count.mockReset().mockResolvedValue(1);
    prisma.auditoria.findMany.mockReset().mockResolvedValue([fila]);
    prisma.auditoria.findUnique.mockReset().mockResolvedValue(fila);
    prisma.auditoria.findFirst.mockReset().mockResolvedValue(null);
    auditoria.registrar.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('listar', () => {
    it('pagina del más reciente al más antiguo y devuelve el total', async () => {
      prisma.auditoria.count.mockResolvedValue(45);

      const pagina = await servicio.listar(consulta({ pagina: 3, tamano: 10 }));

      expect(argumentosDelListado()).toMatchObject({
        where: {},
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip: 20,
        take: 10,
      });
      expect(prisma.auditoria.count).toHaveBeenCalledWith({ where: {} });
      expect(pagina).toMatchObject({ pagina: 3, tamano: 10, total: 45 });
    });

    it('dice quién, cuándo, qué y sobre qué, con los campos que guarda el registro', async () => {
      const { elementos } = await servicio.listar(consulta());

      expect(elementos).toEqual([
        {
          id: 40,
          fecha: '2026-11-10T15:04:05.000Z',
          accion: 'aprobar',
          entidad: 'proyecto_docente',
          idRegistro: 12,
          usuario: { id: 7, nombre: 'Usuario Ficticio' },
          ip: '10.0.0.9',
          campos: ['estado', 'fechaAprobacion'],
        },
      ]);
    });

    it('una acción del sistema llega sin usuario', async () => {
      prisma.auditoria.findMany.mockResolvedValue([
        { ...fila, usuario: null, valor_anterior: null, valor_nuevo: null },
      ]);

      const { elementos } = await servicio.listar(consulta());

      expect(elementos[0]).toMatchObject({ usuario: null, campos: [] });
    });

    it('el rango de fechas va de las 00:00 a las 24:00 de la hora de la institución', async () => {
      await servicio.listar(
        consulta({ desde: '2026-11-01', hasta: '2026-11-10' }),
      );

      expect(argumentosDelListado().where).toEqual({
        fecha: {
          gte: new Date('2026-11-01T05:00:00.000Z'),
          lt: new Date('2026-11-11T05:00:00.000Z'),
        },
      });
    });

    it('filtra por acción, por entidad y por el registro de esa entidad', async () => {
      await servicio.listar(
        consulta({
          accion: 'aprobar',
          entidad: 'proyecto_docente',
          idRegistro: 12,
        }),
      );

      expect(argumentosDelListado().where).toEqual({
        accion: 'aprobar',
        tabla_afectada: 'proyecto_docente',
        id_registro: 12,
      });
    });

    it('busca cada palabra del usuario en el nombre, los apellidos o el correo', async () => {
      await servicio.listar(consulta({ usuario: 'ana  demo' }));

      const campos = (palabra: string) => ({
        OR: [
          { nombres: { contains: palabra } },
          { apellidos: { contains: palabra } },
          { email: { contains: palabra } },
        ],
      });
      expect(argumentosDelListado().where).toEqual({
        usuario: { AND: [campos('ana'), campos('demo')] },
      });
    });

    it('busca el guion bajo y el porcentaje del usuario como texto, no como comodines', async () => {
      await servicio.listar(consulta({ usuario: 'ana_demo 100%' }));

      const where = argumentosDelListado().where as {
        usuario: { AND: { OR: { email?: { contains: string } }[] }[] };
      };
      expect(
        where.usuario.AND.map((palabra) => palabra.OR[2].email?.contains),
      ).toEqual(['ana\\_demo', '100\\%']);
    });

    it('rechaza un rango con la fecha inicial posterior a la final', async () => {
      await expect(
        servicio.listar(consulta({ desde: '2026-11-10', hasta: '2026-11-01' })),
      ).rejects.toThrow(new BadRequestException(MENSAJE_RANGO_INVERTIDO));
      expect(prisma.auditoria.findMany).not.toHaveBeenCalled();
    });

    it('rechaza el identificador de un registro sin su entidad', async () => {
      await expect(
        servicio.listar(consulta({ idRegistro: 12 })),
      ).rejects.toThrow(new BadRequestException(MENSAJE_FALTA_ENTIDAD));
    });
  });

  describe('obtener', () => {
    it('devuelve el registro con el valor anterior y el nuevo', async () => {
      const detalle = await servicio.obtener(40);

      expect(prisma.auditoria.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 40 } }),
      );
      expect(detalle).toMatchObject({
        id: 40,
        accion: 'aprobar',
        valorAnterior: { estado: 'enviado' },
        valorNuevo: { estado: 'aprobado', fechaAprobacion: '2026-11-10' },
      });
    });

    it('una creación llega sin valor anterior', async () => {
      prisma.auditoria.findUnique.mockResolvedValue({
        ...fila,
        accion: 'crear',
        valor_anterior: null,
      });

      const detalle = await servicio.obtener(40);

      expect(detalle.valorAnterior).toBeNull();
      expect(detalle.campos).toEqual(['estado', 'fechaAprobacion']);
    });

    it('no muestra contraseñas ni tokens aunque estén guardados en el registro', async () => {
      prisma.auditoria.findUnique.mockResolvedValue({
        ...fila,
        valor_anterior: { password_hash: 'hash-viejo', activo: true },
        valor_nuevo: {
          password_hash: 'hash-nuevo',
          sesion: { token: 'abc', dispositivo: 'navegador' },
        },
      });

      const detalle = await servicio.obtener(40);

      expect(detalle.valorAnterior).toEqual({
        password_hash: VALOR_OMITIDO,
        activo: true,
      });
      expect(detalle.valorNuevo).toEqual({
        password_hash: VALOR_OMITIDO,
        sesion: { token: VALOR_OMITIDO, dispositivo: 'navegador' },
      });
    });

    it('un valor que no es un objeto llega dentro de «valor»', async () => {
      prisma.auditoria.findUnique.mockResolvedValue({
        ...fila,
        valor_anterior: ['a', 'b'],
        valor_nuevo: 3,
      });

      const detalle = await servicio.obtener(40);

      expect(detalle.valorAnterior).toEqual({ valor: ['a', 'b'] });
      expect(detalle.valorNuevo).toEqual({ valor: 3 });
    });

    it('avisa si el registro no existe', async () => {
      prisma.auditoria.findUnique.mockResolvedValue(null);

      await expect(servicio.obtener(999)).rejects.toThrow(
        new NotFoundException(MENSAJE_REGISTRO_NO_EXISTE),
      );
      expect(auditoria.registrar).not.toHaveBeenCalled();
    });
  });

  describe('constancia de la consulta (RF-29, p1)', () => {
    const comoUsuario = <T>(fn: () => Promise<T>) =>
      ejecutarEnContexto({ ip: '10.0.0.2', idUsuario: 15 }, fn);

    it('la primera consulta deja una consulta sensible sobre la auditoría', async () => {
      vi.useFakeTimers({ now: new Date('2026-11-10T15:00:00.000Z') });

      await comoUsuario(() => servicio.listar(consulta()));

      expect(prisma.auditoria.findFirst).toHaveBeenCalledWith({
        where: {
          id_usuario: 15,
          accion: 'consulta_sensible',
          tabla_afectada: ENTIDAD_CONSULTA_AUDITORIA,
          fecha: {
            gte: new Date(
              Date.parse('2026-11-10T15:00:00.000Z') -
                MINUTOS_ENTRE_CONSTANCIAS * 60 * 1000,
            ),
          },
        },
        select: { id: true },
      });
      expect(auditoria.registrar).toHaveBeenCalledExactlyOnceWith({
        accion: 'consulta_sensible',
        tablaAfectada: ENTIDAD_CONSULTA_AUDITORIA,
        idRegistro: null,
      });
    });

    it('no deja otra si la persona ya tiene una reciente: ni por página ni por detalle', async () => {
      prisma.auditoria.findFirst.mockResolvedValue({ id: 99 });

      await comoUsuario(() => servicio.listar(consulta({ pagina: 2 })));
      await comoUsuario(() => servicio.obtener(40));

      expect(auditoria.registrar).not.toHaveBeenCalled();
    });

    it('varias consultas simultáneas de la misma persona dejan una sola', async () => {
      await comoUsuario(() =>
        Promise.all([
          servicio.listar(consulta()),
          servicio.listar(consulta({ pagina: 2 })),
          servicio.obtener(40),
        ]),
      );
      await comoUsuario(() => servicio.listar(consulta()));

      expect(prisma.auditoria.findFirst).toHaveBeenCalledTimes(1);
      expect(auditoria.registrar).toHaveBeenCalledTimes(1);
    });

    it('pasada la hora vuelve a dejar constancia', async () => {
      vi.useFakeTimers({ now: new Date('2026-11-10T15:00:00.000Z') });
      await comoUsuario(() => servicio.listar(consulta()));
      vi.setSystemTime(new Date('2026-11-10T16:00:01.000Z'));
      await comoUsuario(() => servicio.listar(consulta()));

      expect(auditoria.registrar).toHaveBeenCalledTimes(2);
    });

    it('el detalle también la deja si no hay una reciente', async () => {
      await comoUsuario(() => servicio.obtener(40));

      expect(auditoria.registrar).toHaveBeenCalledTimes(1);
    });

    it('fuera de una petición no deja constancia', async () => {
      await servicio.listar(consulta());

      expect(prisma.auditoria.findFirst).not.toHaveBeenCalled();
      expect(auditoria.registrar).not.toHaveBeenCalled();
    });

    it('si no puede comprobar la constancia, la consulta responde igual (RF-29, excepción p3)', async () => {
      const registrarError = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      prisma.auditoria.findFirst.mockRejectedValue(new Error('sin conexión'));

      const pagina = await comoUsuario(() => servicio.listar(consulta()));

      expect(pagina.elementos).toHaveLength(1);
      expect(registrarError).toHaveBeenCalledTimes(1);
      expect(auditoria.registrar).not.toHaveBeenCalled();

      // Y la siguiente consulta lo vuelve a intentar.
      prisma.auditoria.findFirst.mockResolvedValue(null);
      await comoUsuario(() => servicio.listar(consulta()));
      expect(auditoria.registrar).toHaveBeenCalledTimes(1);
    });
  });
});
