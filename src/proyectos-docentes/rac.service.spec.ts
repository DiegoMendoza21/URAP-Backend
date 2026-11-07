import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import { GuardarRacDto } from './dto/diligenciamiento.dto.js';
import type { EdicionProyectoService } from './edicion-proyecto.service.js';
import {
  MENSAJE_RAC_CON_EVALUACION,
  MENSAJE_RAC_NO_EXISTE,
  MENSAJE_RAP_FUERA_DEL_PROYECTO,
  MENSAJE_RAP_REPETIDO,
  mensajeCodigoRepetido,
  RacService,
} from './rac.service.js';

// Datos ficticios: nunca datos reales de personas en las pruebas.
const docente: UsuarioSesion = {
  id: 20,
  nombres: 'Docente',
  apellidos: 'De Prueba',
  correo: 'docente.prueba@urap.local',
  roles: [ROL.docente],
  jti: 'jti-20',
};

const rap = (id: number) => ({
  id,
  codigo: `RAP ${id}`,
  numero: id,
  descripcion: `Enunciado ficticio del RAP ${id}`,
});

const racGuardado = {
  id: 50,
  codigo: 'RAC 1',
  descripcion: 'Enunciado',
  orden: 1,
  rac_rap: [
    { id_rap: 2, descripcion_contribucion: null, rap: rap(2) },
    { id_rap: 1, descripcion_contribucion: 'Aporta', rap: rap(1) },
  ],
};

function crear() {
  const tx = {
    proyecto_docente_rap: {
      count: vi.fn().mockResolvedValue(2),
      findMany: vi
        .fn()
        .mockResolvedValue([{ rap: rap(1) }, { rap: rap(2) }, { rap: rap(3) }]),
    },
    rac: {
      findFirst: vi.fn().mockResolvedValue(null),
      aggregate: vi.fn().mockResolvedValue({ _max: { orden: 4 } }),
      create: vi.fn().mockResolvedValue(racGuardado),
      update: vi.fn().mockResolvedValue(racGuardado),
      delete: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([racGuardado]),
    },
    rac_rap: { deleteMany: vi.fn().mockResolvedValue({}) },
    evaluacion_rac: { count: vi.fn().mockResolvedValue(0) },
  };
  const auditorias: unknown[] = [];
  const edicion = {
    consultable: vi.fn().mockResolvedValue({}),
    editar: vi.fn(
      (
        _usuario: unknown,
        _id: number,
        cambio: (
          t: typeof tx,
          a: Date,
        ) => Promise<{ resultado: unknown; auditoria: unknown }>,
      ) =>
        cambio(tx, new Date()).then((hecho) => {
          auditorias.push(hecho.auditoria);
          return hecho.resultado;
        }),
    ),
  };
  const servicio = new RacService(
    tx as unknown as PrismaService,
    edicion as unknown as EdicionProyectoService,
  );
  return { servicio, tx, edicion, auditorias };
}

const datos = (cambios: Partial<GuardarRacDto> = {}): GuardarRacDto => ({
  codigo: 'RAC 1',
  enunciado: 'Enunciado',
  raps: [{ idRap: 1, descripcionContribucion: 'Aporta' }, { idRap: 2 }],
  ...cambios,
});

describe('RacService', () => {
  it('agrupa los RAC por RAP y señala los RAP sin RAC (RF-12, p2 y p5)', async () => {
    const { servicio } = crear();
    const seccion = await servicio.seccion(docente, 7);
    expect(seccion.grupos.map((g) => [g.rap.id, g.racs.length])).toEqual([
      [1, 1],
      [2, 1],
      [3, 0],
    ]);
    expect(seccion.rapsSinRac).toEqual([3]);
    // Un RAC asociado a dos RAP aparece en los dos grupos, con sus RAP en orden.
    expect(seccion.grupos[0].racs[0]).toEqual({
      id: 50,
      codigo: 'RAC 1',
      enunciado: 'Enunciado',
      orden: 1,
      raps: [
        {
          idRap: 1,
          codigo: 'RAP 1',
          numero: 1,
          descripcionContribucion: 'Aporta',
        },
        { idRap: 2, codigo: 'RAP 2', numero: 2, descripcionContribucion: null },
      ],
    });
  });

  describe('crear', () => {
    it('guarda el RAC con sus RAP y su contribución, al final del orden (HU-06-03)', async () => {
      const { servicio, tx, auditorias } = crear();
      await servicio.crear(docente, 7, datos());
      expect(tx.rac.create).toHaveBeenCalledWith({
        data: {
          id_proyecto_docente: 7,
          codigo: 'RAC 1',
          descripcion: 'Enunciado',
          orden: 5,
          rac_rap: {
            create: [
              {
                rap: { connect: { id: 1 } },
                descripcion_contribucion: 'Aporta',
              },
              { rap: { connect: { id: 2 } }, descripcion_contribucion: null },
            ],
          },
        },
        include: expect.any(Object),
      });
      expect(auditorias).toEqual([
        expect.objectContaining({
          accion: 'crear',
          tabla: 'rac',
          idRegistro: 50,
        }),
      ]);
    });

    it('rechaza el mismo RAP dos veces (HU-06-03, evita duplicados)', async () => {
      const { servicio, edicion } = crear();
      await expect(
        servicio.crear(
          docente,
          7,
          datos({ raps: [{ idRap: 1 }, { idRap: 1 }] }),
        ),
      ).rejects.toThrow(new BadRequestException(MENSAJE_RAP_REPETIDO));
      expect(edicion.editar).not.toHaveBeenCalled();
    });

    it('rechaza RAP que no son del proyecto', async () => {
      const { servicio, tx } = crear();
      tx.proyecto_docente_rap.count.mockResolvedValue(1);
      await expect(servicio.crear(docente, 7, datos())).rejects.toThrow(
        new BadRequestException(MENSAJE_RAP_FUERA_DEL_PROYECTO),
      );
      expect(tx.rac.create).not.toHaveBeenCalled();
    });

    it('rechaza un código que ya existe en el proyecto', async () => {
      const { servicio, tx } = crear();
      tx.rac.findFirst.mockResolvedValue({ id: 49 });
      await expect(servicio.crear(docente, 7, datos())).rejects.toThrow(
        new ConflictException(mensajeCodigoRepetido('RAC 1')),
      );
    });
  });

  describe('actualizar', () => {
    it('reemplaza los RAP del RAC y excluye al propio RAC al comparar códigos', async () => {
      const { servicio, tx } = crear();
      tx.proyecto_docente_rap.count.mockResolvedValue(1);
      tx.rac.findFirst
        .mockResolvedValueOnce(racGuardado) // racDelProyecto
        .mockResolvedValueOnce(null); // código repetido
      await servicio.actualizar(
        docente,
        7,
        50,
        datos({ raps: [{ idRap: 2 }] }),
      );
      expect(tx.rac.findFirst).toHaveBeenLastCalledWith({
        where: { id_proyecto_docente: 7, codigo: 'RAC 1', id: { not: 50 } },
        select: { id: true },
      });
      expect(tx.rac_rap.deleteMany).toHaveBeenCalledWith({
        where: { id_rac: 50 },
      });
      expect(tx.rac.update).toHaveBeenCalled();
    });

    it('responde 404 si el RAC no es de este proyecto', async () => {
      const { servicio } = crear();
      await expect(
        servicio.actualizar(docente, 7, 999, datos()),
      ).rejects.toThrow(new NotFoundException(MENSAJE_RAC_NO_EXISTE));
    });
  });

  describe('eliminar', () => {
    it('borra el RAC y sus relaciones', async () => {
      const { servicio, tx, auditorias } = crear();
      tx.rac.findFirst.mockResolvedValue(racGuardado);
      await servicio.eliminar(docente, 7, 50);
      expect(tx.rac_rap.deleteMany).toHaveBeenCalledWith({
        where: { id_rac: 50 },
      });
      expect(tx.rac.delete).toHaveBeenCalledWith({ where: { id: 50 } });
      expect(auditorias).toEqual([
        expect.objectContaining({ accion: 'eliminar', idRegistro: 50 }),
      ]);
    });

    it('no borra un RAC que ya tiene evaluaciones', async () => {
      const { servicio, tx } = crear();
      tx.rac.findFirst.mockResolvedValue(racGuardado);
      tx.evaluacion_rac.count.mockResolvedValue(1);
      await expect(servicio.eliminar(docente, 7, 50)).rejects.toThrow(
        new ConflictException(MENSAJE_RAC_CON_EVALUACION),
      );
      expect(tx.rac.delete).not.toHaveBeenCalled();
    });
  });
});

describe('GuardarRacDto', () => {
  const errores = async (cuerpo: object) =>
    (await validate(plainToInstance(GuardarRacDto, cuerpo))).flatMap((e) => [
      ...Object.values(e.constraints ?? {}),
      ...(e.children ?? []).flatMap((hijo) =>
        (hijo.children ?? []).flatMap((n) =>
          Object.values(n.constraints ?? {}),
        ),
      ),
    ]);

  it('no permite un RAC sin RAP (RF-12, p3)', async () => {
    expect(
      await errores({ codigo: 'RAC 1', enunciado: 'Texto', raps: [] }),
    ).toContain('Asocie el RAC al menos a un RAP.');
  });

  it('exige código y enunciado, sin contar los espacios', async () => {
    const mensajes = await errores({
      codigo: '  ',
      enunciado: ' ',
      raps: [{ idRap: 1 }],
    });
    expect(mensajes).toEqual(
      expect.arrayContaining([
        'Escriba el código del RAC.',
        'Escriba el enunciado del RAC.',
      ]),
    );
  });

  it('acepta la contribución vacía como no descrita', async () => {
    const dto = plainToInstance(GuardarRacDto, {
      codigo: ' RAC 2 ',
      enunciado: 'Texto',
      raps: [{ idRap: 1, descripcionContribucion: '  ' }],
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.codigo).toBe('RAC 2');
    expect(dto.raps[0].descripcionContribucion).toBeUndefined();
  });
});
