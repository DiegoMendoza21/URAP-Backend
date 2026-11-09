import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import {
  PARAMETRO,
  separarTextos,
} from '../src/common/parametros/parametros.service.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import {
  ESTRATEGIAS_APRENDIZAJE_MEN,
  ESTRATEGIAS_ENSENANZA_MEN,
} from '../src/datos-iniciales/catalogos.js';
import { sembrarEn } from '../src/datos-iniciales/sembrar-datos.js';

/** Para deshacer el sembrado al terminar: la base queda como estaba. */
class Revertir extends Error {}

// Requiere el .env configurado y la base local levantada. Siembra los datos base dentro de una
// transacción y la revierte: no deja nada en la base, tenga o no el seed.
describe('Datos base (e2e) · npm run db:sembrar se puede repetir', () => {
  let prisma: PrismaService;
  let cerrar: () => Promise<void>;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = modulo.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    cerrar = () => app.close();
  });

  afterAll(async () => {
    await cerrar?.();
  });

  it('sobre una base ya sembrada agrega los parámetros nuevos sin pisar los que cambió el administrador', async () => {
    const catalogo = [
      PARAMETRO.catalogoEstrategiasEnsenanza,
      PARAMETRO.catalogoEstrategiasAprendizaje,
    ];
    let valores = new Map<string | null, string | null>();
    await expect(
      prisma.$transaction(
        async (tx) => {
          // Una base sembrada antes del catálogo del MEN (RF-13), con un parámetro que el
          // administrador ya cambió.
          await sembrarEn(tx);
          await tx.parametro_sistema.deleteMany({
            where: { clave: { in: catalogo } },
          });
          await tx.parametro_sistema.update({
            where: { clave: PARAMETRO.alertaDiasAnticipacion },
            data: { valor: '7' },
          });

          await sembrarEn(tx);
          const filas = await tx.parametro_sistema.findMany({
            select: { clave: true, valor: true },
          });
          valores = new Map(filas.map(({ clave, valor }) => [clave, valor]));
          throw new Revertir();
        },
        { timeout: 120_000 },
      ),
    ).rejects.toBeInstanceOf(Revertir);

    expect(valores.get(PARAMETRO.alertaDiasAnticipacion)).toBe('7');
    expect(
      separarTextos(valores.get(PARAMETRO.catalogoEstrategiasEnsenanza) ?? ''),
    ).toEqual(ESTRATEGIAS_ENSENANZA_MEN);
    expect(
      separarTextos(
        valores.get(PARAMETRO.catalogoEstrategiasAprendizaje) ?? '',
      ),
    ).toEqual(ESTRATEGIAS_APRENDIZAJE_MEN);
  }, 180_000);
});
