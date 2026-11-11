import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { VALOR_OMITIDO } from '../src/auditoria/auditoria.service.js';
import {
  ENTIDAD_CONSULTA_AUDITORIA,
  MENSAJE_FALTA_ENTIDAD,
  MENSAJE_RANGO_INVERTIDO,
  MENSAJE_REGISTRO_NO_EXISTE,
} from '../src/auditoria/consulta-auditoria.service.js';
import { EVENTOS_DE_AUDITORIA } from '../src/auditoria/eventos.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { MENSAJE_SIN_PERMISO } from '../src/auth/roles.guard.js';
import { type NombreRol, ROL } from '../src/auth/roles.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import { borrarUsuariosDePrueba } from './utilidades/limpieza.js';
import {
  asegurarCatalogoDePermisos,
  asegurarPermisosDeRol,
  borrarCatalogoDePrueba,
  borrarMatrizDePrueba,
  matrizDePrueba,
} from './utilidades/permisos.js';

// Requiere el .env configurado y la base local levantada (npm run db:levantar). No depende del
// seed. La base se comparte con las demás pruebas, así que los registros de esta llevan una
// entidad propia y todas las consultas filtran por ella. Datos ficticios; se borran al terminar.
describe('Consulta de la auditoría (e2e) · HU-14-02 y HU-14-03', () => {
  const sufijo = `${Date.now()}`;
  const contrasena = 'Clave-e2e-de-prueba-1';
  const entidad = `e2e_consulta_${sufijo}`;

  let app: INestApplication;
  let prisma: PrismaService;
  const matriz = matrizDePrueba();
  const rolesCreados: number[] = [];
  const idsUsuarios: number[] = [];
  let tokenAdministrador: string;
  let tokenDepartamento: string;
  let tokenDocente: string;
  let idAdministrador: number;
  let idDocente: number;
  /** Ids de los registros de prueba, del más antiguo al más reciente. */
  const ids: number[] = [];
  /** Registros sobre tablas reales, para los eventos: id → evento que le corresponde. */
  const eventoEsperado = new Map<number, string>();
  /** Su día, lejos de cualquier otro registro del docente de esta prueba. */
  const DIA_EVENTOS = '2021-03-03';

  const api = () => request(app.getHttpServer());
  const consultar = (token: string, ruta = '') =>
    api().get(`/api/auditoria${ruta}`).set('Authorization', `Bearer ${token}`);
  /** Listado del Administrador, siempre acotado a los registros de esta prueba. */
  const listar = (filtros: Record<string, string | number> = {}) =>
    consultar(tokenAdministrador).query({ entidad, ...filtros });

  async function rolDelSistema(nombre: NombreRol): Promise<number> {
    const existente = await prisma.rol.findUnique({ where: { nombre } });
    const id =
      existente?.id ??
      (await prisma.rol.create({ data: { nombre, activo: true } })).id;
    if (!existente) {
      rolesCreados.push(id);
    }
    await asegurarPermisosDeRol(prisma, matriz, id, nombre);
    return id;
  }

  async function crearUsuario(
    nombres: string,
    apellidos: string,
    idRol: number,
  ): Promise<{ id: number; token: string }> {
    const correo = `e2e.consulta.${idsUsuarios.length}.${sufijo}@prueba.urap.local`;
    const usuario = await prisma.usuario.create({
      data: {
        nombres,
        apellidos,
        email: correo,
        password_hash: await app.get(ContrasenasService).hashear(contrasena),
        activo: true,
      },
    });
    idsUsuarios.push(usuario.id);
    await prisma.usuario_rol.create({
      data: { id_usuario: usuario.id, id_rol: idRol, activo: true },
    });
    const { body } = await api()
      .post('/api/auth/iniciar-sesion')
      .send({ correo, contrasena })
      .expect(200);
    return { id: usuario.id, token: body.token as string };
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = modulo.createNestApplication();
    configurarAplicacion(app);
    await app.init();
    prisma = app.get(PrismaService);
    await asegurarCatalogoDePermisos(prisma, matriz);

    const administrador = await crearUsuario(
      'Persona',
      `Administradora ${sufijo}`,
      await rolDelSistema(ROL.administrador),
    );
    idAdministrador = administrador.id;
    tokenAdministrador = administrador.token;
    tokenDepartamento = (
      await crearUsuario(
        'Persona',
        `Departamento ${sufijo}`,
        await rolDelSistema(ROL.departamento),
      )
    ).token;
    const docente = await crearUsuario(
      'Persona',
      `Docente_e2e ${sufijo}`,
      await rolDelSistema(ROL.docente),
    );
    idDocente = docente.id;
    tokenDocente = docente.token;

    // Cinco registros en tres días. Las horas van en UTC: las 04:30 del 11 de noviembre son
    // todavía las 23:30 del 10 en la hora de la institución.
    const registros = [
      {
        id_usuario: idDocente,
        accion: 'crear',
        id_registro: 1,
        valor_nuevo: { nombre: 'Registro de prueba' },
        fecha: new Date('2026-11-09T15:00:00.000Z'),
      },
      {
        id_usuario: idDocente,
        accion: 'actualizar',
        id_registro: 1,
        valor_anterior: { estado: 'en_diligenciamiento' },
        valor_nuevo: { estado: 'enviado', fechaEnvio: '2026-11-10' },
        fecha: new Date('2026-11-10T14:00:00.000Z'),
      },
      {
        id_usuario: idAdministrador,
        accion: 'aprobar',
        id_registro: 1,
        valor_anterior: { estado: 'enviado' },
        valor_nuevo: { estado: 'aprobado' },
        fecha: new Date('2026-11-11T04:30:00.000Z'),
      },
      {
        id_usuario: idAdministrador,
        accion: 'actualizar',
        id_registro: 2,
        // Como si hubiera llegado a la tabla sin pasar por AuditoriaService.registrar().
        valor_anterior: { password_hash: 'hash-anterior', activo: true },
        valor_nuevo: { password_hash: 'hash-nuevo', activo: false },
        fecha: new Date('2026-11-11T16:00:00.000Z'),
      },
      {
        id_usuario: null,
        accion: 'eliminar',
        id_registro: 2,
        valor_anterior: { activo: false },
        fecha: new Date('2026-11-11T17:00:00.000Z'),
      },
    ];
    for (const datos of registros) {
      ids.push(
        (
          await prisma.auditoria.create({
            data: { ...datos, tabla_afectada: entidad, ip: '10.0.0.7' },
          })
        ).id,
      );
    }

    // Un registro por cada forma en que se guarda un evento, y varios que no tienen nombre
    // propio, con la forma en que los escriben los servicios.
    const casos: [string, string, object | undefined, string][] = [
      ['crear', 'sesion', { id_usuario: 1 }, 'inicio_sesion'],
      [
        'actualizar',
        'sesion',
        { motivo_revocacion: 'logout' },
        'cierre_sesion',
      ],
      ['crear', 'proyecto_docente', { grupo: 'A' }, 'creacion'],
      ['actualizar', 'proyecto_docente', { horario: [] }, 'modificacion'],
      [
        'actualizar',
        'proyecto_docente',
        { estado: 'en_diligenciamiento' },
        'modificacion',
      ],
      ['actualizar', 'proyecto_docente', undefined, 'modificacion'],
      [
        'actualizar',
        'proyecto_docente',
        { estado: 'enviado', fechaEnvio: '2021-03-03' },
        'envio_revision',
      ],
      [
        'actualizar',
        'proyecto_docente',
        { estado: 'devuelto', observaciones: 2, secciones: ['rac'] },
        'devolucion',
      ],
      ['aprobar', 'proyecto_docente', { estado: 'aprobado' }, 'aprobacion'],
      ['eliminar', 'rac', undefined, 'eliminacion'],
      ['consulta_sensible', 'matricula', undefined, 'consulta_sensible'],
      ['actualizar', 'sesion_clase', { temas: [1] }, 'registro_clase'],
      [
        'actualizar',
        'inasistencia',
        { ausentes: 2, marcados: 2, desmarcados: 0 },
        'registro_inasistencias',
      ],
      ['actualizar', 'matricula', { total: 30 }, 'carga_matriculados'],
      ['crear', 'evidencia_rap', { tipo: 'foto' }, 'carga_evidencia'],
      ['crear', 'reporte_academico', { tipo: 'logro' }, 'generacion_reporte'],
      ['crear', 'medicion_rap', { idRap: 2 }, 'creacion'],
      ['actualizar', 'medicion_rap', { valoraciones: 3 }, 'modificacion'],
      ['actualizar', 'medicion_rap', { estado: 'cerrada' }, 'cierre_medicion'],
      [
        'actualizar',
        'medicion_rap',
        { estado: 'borrador' },
        'reapertura_medicion',
      ],
      ['crear', 'usuario', { activo: true }, 'creacion'],
      ['actualizar', 'usuario', { nombres: 'Persona' }, 'modificacion'],
      [
        'actualizar',
        'usuario',
        { motivo: 'intentos_fallidos_consecutivos', intentos_fallidos: 0 },
        'bloqueo_usuario',
      ],
      ['actualizar', 'usuario', { activo: false }, 'inactivacion_usuario'],
      ['actualizar', 'usuario', { activo: true }, 'reactivacion_usuario'],
      [
        'actualizar',
        'usuario',
        { contrasena: VALOR_OMITIDO },
        'restablecimiento_contrasena',
      ],
      ['crear', 'usuario_rol', { activo: true }, 'asignacion_rol'],
      ['actualizar', 'usuario_rol', { activo: true }, 'asignacion_rol'],
      ['actualizar', 'usuario_rol', { activo: false }, 'revocacion_rol'],
      ['actualizar', 'rol', { activo: false }, 'modificacion'],
    ];
    for (const [accion, tabla, valorNuevo, evento] of casos) {
      const { id } = await prisma.auditoria.create({
        data: {
          id_usuario: idDocente,
          accion,
          tabla_afectada: tabla,
          id_registro: 1,
          valor_nuevo: valorNuevo,
          fecha: new Date(`${DIA_EVENTOS}T15:00:00.000Z`),
        },
      });
      eventoEsperado.set(id, evento);
    }
    // Tres usuarios con su contraseña y su inicio de sesión: en un equipo ocupado no cabe
    // en los 10 segundos por defecto.
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.auditoria.deleteMany({
        where: {
          OR: [
            { tabla_afectada: entidad },
            { id: { in: [...eventoEsperado.keys()] } },
          ],
        },
      });
      await borrarUsuariosDePrueba(prisma, idsUsuarios);
      await borrarMatrizDePrueba(prisma, matriz);
      await prisma.rol.deleteMany({ where: { id: { in: rolesCreados } } });
      await borrarCatalogoDePrueba(prisma, matriz);
    }
    await app?.close();
  });

  describe('quién puede consultar', () => {
    it('sin sesión responde 401', async () => {
      await api().get('/api/auditoria').expect(401);
      await api().get(`/api/auditoria/${ids[0]}`).expect(401);
    });

    it('el Docente no puede: 403 en el listado y en el detalle', async () => {
      const listado = await consultar(tokenDocente).expect(403);
      expect(listado.body.mensaje).toBe(MENSAJE_SIN_PERMISO);
      await consultar(tokenDocente, `/${ids[0]}`).expect(403);
    });

    it('el Departamento tampoco: su consulta restringida (auditoria.leer) no abre la completa', async () => {
      await consultar(tokenDepartamento).expect(403);
      await consultar(tokenDepartamento, `/${ids[0]}`).expect(403);
    });

    it('los intentos rechazados no dejan constancia de consulta', async () => {
      const constancias = await prisma.auditoria.count({
        where: {
          id_usuario: idDocente,
          tabla_afectada: ENTIDAD_CONSULTA_AUDITORIA,
        },
      });
      expect(constancias).toBe(0);
    });
  });

  describe('listado con filtros (HU-14-02)', () => {
    it('el Administrador ve los registros del más reciente al más antiguo', async () => {
      const { body } = await listar().expect(200);

      expect(body).toMatchObject({ pagina: 1, tamano: 20, total: 5 });
      expect(body.elementos.map((e: { id: number }) => e.id)).toEqual(
        [...ids].reverse(),
      );
      expect(body.elementos[2]).toEqual({
        id: ids[2],
        fecha: '2026-11-11T04:30:00.000Z',
        accion: 'aprobar',
        evento: 'aprobacion',
        entidad,
        idRegistro: 1,
        usuario: {
          id: idAdministrador,
          nombre: `Persona Administradora ${sufijo}`,
        },
        ip: '10.0.0.7',
        campos: ['estado'],
      });
      // El listado no trae los valores: van en el detalle.
      expect(body.elementos[2]).not.toHaveProperty('valorNuevo');
    });

    it('una acción del sistema llega sin usuario', async () => {
      const { body } = await listar({ accion: 'eliminar' }).expect(200);

      expect(body.total).toBe(1);
      expect(body.elementos[0]).toMatchObject({ id: ids[4], usuario: null });
    });

    it('está paginado', async () => {
      const { body } = await listar({ tamano: 2, pagina: 2 }).expect(200);

      expect(body).toMatchObject({ pagina: 2, tamano: 2, total: 5 });
      expect(body.elementos.map((e: { id: number }) => e.id)).toEqual([
        ids[2],
        ids[1],
      ]);
    });

    it('filtra por acción', async () => {
      const { body } = await listar({ accion: 'actualizar' }).expect(200);

      expect(body.elementos.map((e: { id: number }) => e.id)).toEqual([
        ids[3],
        ids[1],
      ]);
    });

    describe('lo que pasó, con palabras del dominio (evento)', () => {
      /** Los registros de eventos de esta prueba: los del docente, en su día. */
      const listarEventos = (filtros: Record<string, string> = {}) =>
        consultar(tokenAdministrador).query({
          usuario: `Docente_e2e ${sufijo}`,
          desde: DIA_EVENTOS,
          hasta: DIA_EVENTOS,
          tamano: 100,
          ...filtros,
        });

      it('cada registro dice lo que pasó: un inicio de sesión no es una «creación»', async () => {
        const { body } = await listarEventos().expect(200);

        expect(body.total).toBe(eventoEsperado.size);
        expect(
          new Map(
            body.elementos.map((e: { id: number; evento: string }) => [
              e.id,
              e.evento,
            ]),
          ),
        ).toEqual(eventoEsperado);
      });

      it('el filtro por evento devuelve justo los registros que llevan ese nombre', async () => {
        for (const evento of EVENTOS_DE_AUDITORIA) {
          const { body } = await listarEventos({ evento }).expect(200);

          const esperados = [...eventoEsperado]
            .filter(([, suyo]) => suyo === evento)
            .map(([id]) => id);
          expect(esperados.length, evento).toBeGreaterThan(0);
          expect(
            body.elementos.map((e: { id: number }) => e.id).sort(),
            evento,
          ).toEqual(esperados.sort());
        }
      });

      it('el evento se combina con la entidad', async () => {
        const { body } = await listarEventos({
          evento: 'modificacion',
          entidad: 'proyecto_docente',
        }).expect(200);

        expect(body.total).toBe(3);
      });

      it('rechaza un evento que no existe', async () => {
        await listarEventos({ evento: 'inventado' }).expect(400);
      });
    });

    it('filtra por rango de fechas, con el día de la hora de la institución', async () => {
      const unDia = await listar({
        desde: '2026-11-10',
        hasta: '2026-11-10',
      }).expect(200);
      // El de las 04:30 UTC del 11 todavía es del 10 en Colombia.
      expect(unDia.body.elementos.map((e: { id: number }) => e.id)).toEqual([
        ids[2],
        ids[1],
      ]);

      const desde = await listar({ desde: '2026-11-11' }).expect(200);
      expect(desde.body.total).toBe(2);

      const hasta = await listar({ hasta: '2026-11-09' }).expect(200);
      expect(hasta.body.elementos.map((e: { id: number }) => e.id)).toEqual([
        ids[0],
      ]);
    });

    it('filtra por usuario, con parte del nombre o del correo', async () => {
      const porNombre = await listar({
        usuario: `persona docente ${sufijo}`,
      }).expect(200);
      expect(porNombre.body.elementos.map((e: { id: number }) => e.id)).toEqual(
        [ids[1], ids[0]],
      );

      const porCorreo = await listar({
        usuario: `e2e.consulta.0.${sufijo}`,
      }).expect(200);
      expect(porCorreo.body.total).toBe(2);
      expect(porCorreo.body.elementos[0].usuario.id).toBe(idAdministrador);

      const nadie = await listar({ usuario: 'nadie-con-este-nombre' }).expect(
        200,
      );
      expect(nadie.body).toMatchObject({ total: 0, elementos: [] });
    });

    it('el guion bajo del texto del usuario busca un guion bajo, no cualquier carácter', async () => {
      const conGuion = await listar({
        usuario: `docente_e2e ${sufijo}`,
      }).expect(200);
      expect(conGuion.body.total).toBe(2);

      // Como comodín, «e2e_consulta» encontraría los correos «e2e.consulta…».
      const sinComodin = await listar({ usuario: 'e2e_consulta' }).expect(200);
      expect(sinComodin.body.total).toBe(0);
    });

    it('con la entidad y el registro devuelve el historial completo de ese registro (HU-14-03)', async () => {
      const { body } = await listar({ idRegistro: 1 }).expect(200);

      expect(body.elementos.map((e: { id: number }) => e.id)).toEqual([
        ids[2],
        ids[1],
        ids[0],
      ]);
    });

    it('rechaza los filtros que no son válidos', async () => {
      const sinEntidad = await consultar(tokenAdministrador)
        .query({ idRegistro: 1 })
        .expect(400);
      expect(sinEntidad.body.mensaje).toBe(MENSAJE_FALTA_ENTIDAD);

      const invertido = await listar({
        desde: '2026-11-11',
        hasta: '2026-11-09',
      }).expect(400);
      expect(invertido.body.mensaje).toBe(MENSAJE_RANGO_INVERTIDO);

      await listar({ accion: 'borrar' }).expect(400);
      await listar({ desde: '11/11/2026' }).expect(400);
      await listar({ desde: '2026-02-30' }).expect(400);
      await listar({ tamano: 101 }).expect(400);
      await listar({ ordenar: 'ip' }).expect(400);
    });
  });

  describe('detalle (HU-14-03)', () => {
    it('muestra el valor anterior y el nuevo de una modificación', async () => {
      const { body } = await consultar(tokenAdministrador, `/${ids[1]}`).expect(
        200,
      );

      expect(body).toMatchObject({
        id: ids[1],
        accion: 'actualizar',
        entidad,
        idRegistro: 1,
        campos: ['estado', 'fechaEnvio'],
        valorAnterior: { estado: 'en_diligenciamiento' },
        valorNuevo: { estado: 'enviado', fechaEnvio: '2026-11-10' },
      });
    });

    it('una creación no tiene valor anterior', async () => {
      const { body } = await consultar(tokenAdministrador, `/${ids[0]}`).expect(
        200,
      );

      expect(body.valorAnterior).toBeNull();
      expect(body.valorNuevo).toEqual({ nombre: 'Registro de prueba' });
    });

    it('nunca muestra contraseñas, aunque el registro las tenga guardadas', async () => {
      const { body, text } = await consultar(
        tokenAdministrador,
        `/${ids[3]}`,
      ).expect(200);

      expect(body.valorAnterior).toEqual({
        password_hash: VALOR_OMITIDO,
        activo: true,
      });
      expect(body.valorNuevo).toEqual({
        password_hash: VALOR_OMITIDO,
        activo: false,
      });
      expect(text).not.toContain('hash-anterior');
      expect(text).not.toContain('hash-nuevo');
    });

    it('responde 404 si el registro no existe y 400 si el id no es un número', async () => {
      const { body } = await consultar(tokenAdministrador, '/999999999').expect(
        404,
      );
      expect(body.mensaje).toBe(MENSAJE_REGISTRO_NO_EXISTE);
      await consultar(tokenAdministrador, '/abc').expect(400);
    });
  });

  it('los registros no se pueden modificar ni eliminar (RF-29, excepción p4)', async () => {
    const ruta = `/api/auditoria/${ids[1]}`;
    const comoAdministrador = (peticion: request.Test) =>
      peticion.set('Authorization', `Bearer ${tokenAdministrador}`);

    await comoAdministrador(api().delete(ruta)).expect(404);
    await comoAdministrador(api().patch(ruta).send({ accion: 'crear' })).expect(
      404,
    );
    await comoAdministrador(api().put(ruta).send({ accion: 'crear' })).expect(
      404,
    );
    await comoAdministrador(
      api().post('/api/auditoria').send({ accion: 'crear' }),
    ).expect(404);

    const registro = await prisma.auditoria.findUniqueOrThrow({
      where: { id: ids[1] },
    });
    expect(registro.accion).toBe('actualizar');
  });

  it('la consulta deja una sola constancia por persona, no una por página consultada', async () => {
    // A esta altura el Administrador ya hizo decenas de consultas en esta prueba.
    await listar({ pagina: 2, tamano: 2 }).expect(200);
    await consultar(tokenAdministrador, `/${ids[0]}`).expect(200);

    const constancias = await prisma.auditoria.findMany({
      where: {
        id_usuario: idAdministrador,
        tabla_afectada: ENTIDAD_CONSULTA_AUDITORIA,
      },
    });
    expect(constancias).toHaveLength(1);
    expect(constancias[0]).toMatchObject({
      accion: 'consulta_sensible',
      id_registro: null,
      valor_anterior: null,
      valor_nuevo: null,
    });

    // Y la constancia se puede consultar como cualquier otro registro.
    const { body } = await consultar(tokenAdministrador)
      .query({ entidad: ENTIDAD_CONSULTA_AUDITORIA, usuario: sufijo })
      .expect(200);
    expect(body.total).toBe(1);
    expect(body.elementos[0]).toMatchObject({
      id: constancias[0].id,
      accion: 'consulta_sensible',
      usuario: { id: idAdministrador },
    });
  });
});
