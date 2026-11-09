import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { ParametrosService } from '../common/parametros/parametros.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import {
  DiligenciamientoService,
  LONGITUD_DESCRIPCION_RESPALDO,
  mensajeDescripcionLarga,
} from './diligenciamiento.service.js';
import {
  DESCRIPCION_TOPE_TECNICO,
  GuardarDescripcionDto,
} from './dto/diligenciamiento.dto.js';
import type { EdicionProyectoService } from './edicion-proyecto.service.js';

// Datos ficticios: nunca datos reales de personas en las pruebas.
const docente: UsuarioSesion = {
  id: 20,
  nombres: 'Docente',
  apellidos: 'De Prueba',
  correo: 'docente.prueba@urap.local',
  roles: [ROL.docente],
  jti: 'jti-20',
  idSesion: 1,
  asignaciones: [],
  permisos: [],
};

function crear(valorParametro: string | null = '10') {
  const tx = {
    proyecto_docente: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        descripcion: 'antes',
        fecha_actualizacion: new Date('2026-11-01T10:00:00Z'),
      }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    parametro_sistema: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          valorParametro === null ? null : { valor: valorParametro },
        ),
    },
    proyecto_docente: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        descripcion: null,
        proyecto_docente_rap: [
          { rap: { id: 1, codigo: 'RAP 1', numero: 1 } },
          { rap: { id: 2, codigo: 'RAP 2', numero: 2 } },
        ],
        rac: [
          {
            codigo: 'RAC 1',
            rac_rap: [{ id_rap: 1 }],
            _count: { evaluacion_rac: 0 },
          },
        ],
        periodo_academico: { numero_semanas: 2 },
        contenido_programatico: [{ semana: 1, tema: 'Presentación' }],
        _count: { estrategia_metodologica: 2, bibliografia: 0 },
      }),
    },
  };
  const ahora = new Date('2026-11-07T15:00:00Z');
  const auditorias: unknown[] = [];
  const edicion = {
    consultable: vi.fn().mockResolvedValue({
      id: 7,
      descripcion: 'Texto guardado',
      fecha_actualizacion: ahora,
      estado_proyecto: {
        codigo: 'en_diligenciamiento',
        nombre: 'En diligenciamiento',
        permite_edicion: true,
      },
      proyecto_docente_docente: [{ id_usuario: 20 }],
    }),
    motivoNoEditable: vi.fn().mockReturnValue(null),
    editar: vi.fn(
      (
        _usuario: unknown,
        _id: number,
        cambio: (
          t: typeof tx,
          a: Date,
        ) => Promise<{ resultado: unknown; auditoria: unknown }>,
      ) =>
        cambio(tx, ahora).then((hecho) => {
          auditorias.push(hecho.auditoria);
          return hecho.resultado;
        }),
    ),
  };
  const servicio = new DiligenciamientoService(
    prisma as unknown as PrismaService,
    edicion as unknown as EdicionProyectoService,
    new ParametrosService(prisma as unknown as PrismaService),
  );
  return { servicio, prisma, tx, edicion, auditorias };
}

describe('DiligenciamientoService', () => {
  describe('guardarDescripcion (RF-11)', () => {
    it('guarda el texto y devuelve la fecha de modificación', async () => {
      const { servicio, tx } = crear();
      const respuesta = await servicio.guardarDescripcion(docente, 7, {
        texto: 'Hola\nmundo',
      });
      expect(tx.proyecto_docente.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { descripcion: 'Hola\nmundo' },
      });
      expect(respuesta).toEqual({
        texto: 'Hola\nmundo',
        longitudMaxima: 10,
        fechaActualizacion: '2026-11-07T15:00:00.000Z',
      });
    });

    it('impide guardar si supera la longitud del parámetro (p3)', async () => {
      const { servicio, edicion } = crear('10');
      await expect(
        servicio.guardarDescripcion(docente, 7, { texto: 'x'.repeat(11) }),
      ).rejects.toThrow(new BadRequestException(mensajeDescripcionLarga(10)));
      expect(edicion.editar).not.toHaveBeenCalled();
    });

    it('un texto vacío deja la sección pendiente (HU-06-08)', async () => {
      const { servicio, tx } = crear();
      const respuesta = await servicio.guardarDescripcion(docente, 7, {
        texto: '   ',
      });
      expect(tx.proyecto_docente.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { descripcion: null },
      });
      expect(respuesta.texto).toBeNull();
    });

    it('audita solo la descripción, con el valor anterior y el nuevo (RF-29)', async () => {
      const { servicio, auditorias } = crear();
      await servicio.guardarDescripcion(docente, 7, { texto: 'después' });
      expect(auditorias).toEqual([
        {
          accion: 'actualizar',
          tabla: 'proyecto_docente',
          idRegistro: 7,
          anterior: { descripcion: 'antes' },
          nuevo: { descripcion: 'después' },
        },
      ]);
    });

    it('guardar el mismo texto no deja rastro en la auditoría', async () => {
      const { servicio, auditorias, tx } = crear();
      const respuesta = await servicio.guardarDescripcion(docente, 7, {
        texto: 'antes',
      });
      expect(auditorias).toEqual([null]);
      // Ni se escribe ni cambia la fecha: se devuelve la que ya tenía.
      expect(tx.proyecto_docente.update).not.toHaveBeenCalled();
      expect(respuesta.fechaActualizacion).toBe('2026-11-01T10:00:00.000Z');
    });
  });

  it('no promete más que el tope técnico del DTO', async () => {
    expect(
      await crear(String(DESCRIPCION_TOPE_TECNICO)).servicio.longitudMaxima(),
    ).toBe(DESCRIPCION_TOPE_TECNICO);
    expect(
      await crear(
        String(DESCRIPCION_TOPE_TECNICO + 1),
      ).servicio.longitudMaxima(),
    ).toBe(DESCRIPCION_TOPE_TECNICO);
  });

  it('usa el valor de respaldo si el parámetro falta o es inválido', async () => {
    expect(await crear(null).servicio.longitudMaxima()).toBe(
      LONGITUD_DESCRIPCION_RESPALDO,
    );
    expect(await crear('abc').servicio.longitudMaxima()).toBe(
      LONGITUD_DESCRIPCION_RESPALDO,
    );
  });

  it('resume las secciones con sus pendientes y su estado (HU-06-08, HU-06-09)', async () => {
    const { servicio } = crear();
    const resumen = await servicio.resumen(docente, 7);
    expect(resumen).toMatchObject({
      idProyecto: 7,
      puedeEditar: true,
      motivoNoEditable: null,
      estado: { codigo: 'en_diligenciamiento' },
      secciones: [
        { numero: 2, completa: false, estado: 'vacia' },
        {
          numero: 3,
          completa: false,
          estado: 'incompleta',
          pendientes: ['RAP 2 no tiene RAC asociados.'],
        },
        { numero: 4, completa: true, estado: 'completa', pendientes: [] },
        {
          numero: 5,
          completa: false,
          estado: 'vacia',
          pendientes: ['RAC 1 no tiene actividades de evaluación.'],
        },
        {
          numero: 6,
          completa: false,
          estado: 'incompleta',
          pendientes: ['La semana 2 no tiene tema.'],
        },
        { numero: 7, completa: false, estado: 'vacia' },
      ],
      completitud: { completas: 1, total: 6, porcentaje: 16.67 },
    });
  });
});

describe('GuardarDescripcionDto', () => {
  it('convierte los saltos de línea de Windows', async () => {
    const dto = plainToInstance(GuardarDescripcionDto, { texto: 'a\r\nb' });
    expect(await validate(dto)).toEqual([]);
    expect(dto.texto).toBe('a\nb');
  });

  it('exige un texto', async () => {
    const dto = plainToInstance(GuardarDescripcionDto, { texto: 5 });
    expect(await validate(dto)).not.toEqual([]);
  });
});
