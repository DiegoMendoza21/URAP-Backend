# Despliegue de URAP en AWS

Guía para desplegar URAP con HTTPS en una cuenta de AWS con el plan gratuito (URAP-114). Es la
arquitectura del Producto 2 de la tesis, en su versión mínima:

```
Internet ──HTTPS──▶ EC2 ─┬─ caddy ──▶ frontend (Next.js) ──▶ backend (API)
                         │                                       │
                         └─ /srv/urap/almacenamiento (evidencias) │
                                                                  └──TLS──▶ RDS MySQL 8.4
```

- **EC2**: un servidor con Docker. Corre el frontend, el backend y **Caddy**, que obtiene y
  renueva el certificado HTTPS con Let's Encrypt (NFR-006). Solo Caddy publica puertos: el
  backend no queda expuesto a internet.
- **RDS**: MySQL 8.4 administrado, con copias de seguridad automáticas diarias (NFR-010). La
  conexión desde el backend va cifrada y verifica el certificado del servidor.
- **Archivos**: las evidencias y los documentos soporte quedan en el disco del servidor, en
  `/srv/urap/almacenamiento`, fuera de los contenedores (NFR-007). Pasarlos a S3 es un cambio
  aparte.

**En qué se aparta del Producto 2.** Este despliegue del prototipo es una versión reducida de la
arquitectura que documenta la tesis:

- el frontend corre en un contenedor de Next.js en el mismo EC2, detrás de Caddy;
- la API corre con Docker Compose en esa misma instancia, sin balanceador ni réplicas;
- los documentos quedan en el disco de la instancia, no en un servicio de almacenamiento de
  objetos (S3);
- el certificado HTTPS lo emite Let's Encrypt a través de Caddy.

Quien mantiene la tesis decide si actualiza el diagrama de despliegue o lo explica como el
despliegue reducido del prototipo.

Los archivos del despliegue están en `despliegue/`: `docker-compose.yml`, `Caddyfile` y la
plantilla de variables `.env.example`. Los Dockerfiles están en la raíz de cada repositorio.

Los pasos 1 a 4 se hacen una sola vez en la consola de AWS. Los 5 a 8, por SSH en el servidor.

---

## 0. Antes de empezar

1. **Región.** Cree la base y el servidor en la misma región (arriba a la derecha en la
   consola), para que se vean entre sí. Las cuentas nuevas suelen quedar en una región fija;
   esta guía usa `us-east-2` (Ohio) en los ejemplos, y cualquier otra sirve igual.
2. **Alerta de gastos.** En *Billing and Cost Management → Budgets*, cree un presupuesto
   mensual pequeño (por ejemplo, 5 USD) con aviso al correo. El plan gratuito descuenta de los
   créditos, y la alerta avisa antes de que algo cueste.
3. Tenga a mano un generador de contraseñas: hacen falta tres (la del usuario maestro de RDS,
   la del usuario de la aplicación y la de los usuarios de demostración).

## 1. Base de datos en RDS

*RDS → Databases → Create database*:

| Campo | Valor |
|---|---|
| Creation method | Standard create |
| Engine | MySQL, versión **8.4** (la más reciente 8.4.x) |
| Templates | **Free tier** |
| DB instance identifier | `urap` |
| Master username | `admin`, con una contraseña generada (guárdela) |
| Instance class | la que ofrezca la plantilla gratuita (`db.t4g.micro` o `db.t3.micro`) |
| Storage | 20 GB, gp3 |
| Connectivity | *Don't connect to an EC2 compute resource*; VPC por defecto; **Public access: No** |
| VPC security group | *Create new*, nombre `urap-rds` |
| Additional configuration → Initial database name | `urap` |
| Backup | Automated backups **activadas**, con la mayor retención que permita la plantilla |

Al terminar (tarda unos minutos), copie el **Endpoint** de la base: algo como
`urap.abc123xyz.us-east-2.rds.amazonaws.com`.

## 2. Servidor en EC2

*EC2 → Instances → Launch instances*:

| Campo | Valor |
|---|---|
| Name | `urap` |
| AMI | **Ubuntu Server 24.04 LTS** |
| Instance type | Uno marcado *Free tier eligible*, mejor con **2 GB** de memoria (por ejemplo `t3.small`, si aparece como elegible). Con 1 GB hay que activar memoria de intercambio (paso 5). |
| Key pair | *Create new key pair*, tipo RSA, formato `.pem`. Guarde el archivo: es la única forma de entrar por SSH. |
| Network settings → Security group | *Create security group* `urap-web`: SSH (22) desde **My IP**, HTTP (80) y HTTPS (443) desde **Anywhere** |
| Storage | 30 GB gp3 |

**IP fija.** En *EC2 → Elastic IPs → Allocate Elastic IP address* y luego *Associate* con la
instancia `urap`. Copie la IP (por ejemplo `203.0.113.10`): el dominio apuntará a ella.

**SSH y «My IP».** La regla del 22 deja entrar solo a la IP pública desde la que la creó, y esa IP
cambia sin avisar (otra red, o el proveedor de internet la renueva). Si `ssh` responde
`Connection timed out`, vuelva a elegir **My IP** en esa regla. La otra persona del equipo debe
agregar su propia IP en `urap-web` antes de entrar.

## 3. Que el servidor llegue a la base

En *EC2 → Security Groups → `urap-rds` → Inbound rules → Edit*: agregue una regla **MySQL/Aurora
(3306)** cuyo origen sea el grupo **`urap-web`** (no una IP). Así solo el servidor de URAP llega
a la base.

Revise también que `urap-rds` no tenga otra regla de entrada: si el asistente de RDS agregó una
con la IP de su casa, bórrela, para que el único origen sea `urap-web`.

## 4. Dominio

Let's Encrypt necesita un nombre de dominio que apunte a la IP elástica.

- **Con un subdominio propio** (por ejemplo, uno de la universidad): pida un registro **A** hacia
  la IP elástica.
- **Sin dominio propio**: use `sslip.io`, que resuelve cualquier nombre que contenga la IP. Con
  la IP `203.0.113.10`, el dominio es **`203-0-113-10.sslip.io`**. No hay que registrar nada.

  Let's Encrypt limita los certificados por dominio registrado, y `sslip.io` no está en la lista
  pública de sufijos: todos los que lo usan en el mundo comparten el mismo cupo. Si se agota,
  Caddy reintenta solo, pero puede tardar horas (ver «Problemas frecuentes»). Para la
  sustentación conviene un subdominio propio.

---

## 5. Preparar el servidor

Entre por SSH (desde la carpeta donde guardó la llave):

```bash
chmod 400 urap.pem
ssh -i urap.pem ubuntu@203.0.113.10
```

Instale Docker y prepare las carpetas:

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker ubuntu
sudo mkdir -p /srv/urap/almacenamiento /srv/urap/certificados
sudo chown ubuntu:ubuntu /srv/urap /srv/urap/certificados
# El backend corre como el usuario node (uid 1000) dentro del contenedor.
sudo chown 1000:1000 /srv/urap/almacenamiento
```

Salga (`exit`) y vuelva a entrar por SSH para que el grupo `docker` tenga efecto.

**Solo si la instancia tiene 1 GB de memoria**, active 2 GB de intercambio; si no, la
compilación de las imágenes se queda sin memoria:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Descargue la CA de RDS (la que verifica el certificado de la base) y los dos repositorios:

```bash
curl -fsSL -o /srv/urap/certificados/global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
cd /srv/urap
git clone https://github.com/DiegoMendoza21/URAP-Backend.git
git clone https://github.com/DiegoMendoza21/URAP-Frontend.git
```

## 6. Usuario de la aplicación en la base

La API no usa el usuario maestro: se crea uno que solo tiene permisos sobre la base `urap`.
Desde el servidor, con el cliente de MySQL en un contenedor y conexión cifrada:

```bash
docker run --rm -it -v /srv/urap/certificados:/certificados:ro mysql:8.4 \
  mysql -h ENDPOINT-DE-RDS -u admin -p \
  --ssl-ca=/certificados/global-bundle.pem --ssl-mode=VERIFY_IDENTITY
```

Escriba la contraseña maestra y luego, con una contraseña nueva para la aplicación:

```sql
CREATE USER 'urap'@'%' IDENTIFIED BY 'CONTRASENA-DE-LA-APLICACION' REQUIRE SSL;
GRANT ALL PRIVILEGES ON urap.* TO 'urap'@'%';
EXIT;
```

Cambie `CONTRASENA-DE-LA-APLICACION` por la contraseña nueva antes de ejecutar el `CREATE USER`:
use solo letras y números, de 16 caracteres o más. Si ya creó el usuario con el texto de
ejemplo, cámbiela con `ALTER USER 'urap'@'%' IDENTIFIED BY 'la-nueva';`.

`REQUIRE SSL` hace que la base rechace cualquier conexión de ese usuario sin cifrar.

## 7. Variables

```bash
cd /srv/urap/URAP-Backend/despliegue
cp .env.example .env
chmod 600 .env
nano .env
```

Complete:

- `DOMINIO`: el del paso 4, sin `https://`.
- `DATABASE_URL`: `mysql://urap:CONTRASENA-DE-LA-APLICACION@ENDPOINT-DE-RDS:3306/urap?sslcert=/certificados/global-bundle.pem&sslaccept=strict`.
  Si la contraseña tiene `@ : / ? #`, escríbalos codificados (`%40`, `%3A`, `%2F`, `%3F`, `%23`).
- `JWT_SECRETO`: el resultado de `openssl rand -base64 48`.
- `CONTRASENA_USUARIOS_DEMO`: solo si va a cargar los datos de demostración (paso 8).

Cada línea ya trae el nombre de la variable y el `=`: escriba o pegue **solo el valor**
después del `=`. Si pega la línea completa, queda `DATABASE_URL=DATABASE_URL=mysql://…` y
`prisma migrate deploy` responde `P1013 … The scheme is not recognized`. Para revisarlo sin
mostrar la contraseña:

```bash
grep -n 'DATABASE_URL' .env | sed -E 's#(urap:)[^@]*@#\1****@#' | cat -A
```

Debe salir una sola línea, que empiece por `DATABASE_URL=mysql://` y termine en `strict$`.

La API no arranca si falta una variable o si `DATABASE_URL` no lleva `sslcert` y
`sslaccept=strict`: lo dice en el registro (`docker compose logs backend`).

## 8. Primer despliegue

Todo desde `/srv/urap/URAP-Backend/despliegue`:

```bash
docker compose build
docker compose run --rm --no-deps backend npx prisma migrate deploy
docker compose run --rm --no-deps backend node dist/datos-iniciales/sembrar.js
docker compose up -d
```

1. `build` construye las imágenes del backend y del frontend (la primera vez tarda varios
   minutos).
2. `migrate deploy` crea las tablas en RDS.
3. `sembrar.js` carga los datos base: catálogos, programa, RAP, rúbricas y planes de estudio.
4. `up -d` levanta todo. Caddy pide el certificado al arrancar.

Abra `https://DOMINIO` desde el teléfono: debe aparecer el inicio de sesión con el candado.

### Datos de demostración (solo para el servidor de la demo)

`sembrar.js --demo` se niega a correr con `NODE_ENV=production`, porque crea un Administrador
con una contraseña compartida. En el servidor de la demostración se corre una sola vez, con
`NODE_ENV=development` solo para ese comando (la API sigue en producción):

```bash
docker compose run --rm --no-deps -e NODE_ENV=development backend node dist/datos-iniciales/sembrar.js --demo
```

- Use una `CONTRASENA_USUARIOS_DEMO` larga y que no use en ningún otro lado: el servidor es
  público.
- `CONTRASENA_USUARIOS_DEMO` solo la usa este comando, y el compose carga todo el `.env` en el
  backend: después de sembrar, bórrela de `despliegue/.env` y aplique con `docker compose up -d`.
  La API no la necesita.
- Las clases de los 7 días anteriores a la siembra quedan como vencidas. Para la demostración,
  siembre cerca de la fecha. Si ya había datos de demostración, el seed no los vuelve a tocar:
  para empezar de cero hay que borrar la base (`DROP DATABASE urap; CREATE DATABASE urap;` con
  el usuario maestro) y repetir el paso 8.
- Cuando el sistema se use con datos reales, la base se crea sin `--demo`.

---

## Actualizar con lo último de `main`

```bash
cd /srv/urap/URAP-Frontend && git pull
cd /srv/urap/URAP-Backend && git pull
cd despliegue
docker compose build
docker compose run --rm --no-deps backend npx prisma migrate deploy
docker compose run --rm --no-deps backend node dist/datos-iniciales/sembrar.js
docker compose up -d
docker image prune -f
```

`migrate deploy` solo aplica las migraciones nuevas, y `sembrar.js` solo agrega lo que falta
(por ejemplo, un parámetro nuevo): no pisa lo que se haya cambiado desde la aplicación. La
aplicación se corta unos segundos mientras los contenedores se reemplazan.

Cada imagen pesa cerca de 1 GB, y cada `docker compose build` deja la anterior sin nombre:
`docker image prune -f` la borra para que no se llene el disco.

Para ver qué pasa: `docker compose ps` y `docker compose logs -f backend` (o `frontend`, `caddy`).

## Respaldo y restauración (NFR-010)

**Base de datos.** RDS hace una copia automática diaria y guarda el registro de cambios, así que
se puede volver a cualquier minuto dentro del período de retención.

Para restaurar:

1. *RDS → Databases → `urap` → Actions → Restore to point in time*.
2. Elija el momento y un identificador nuevo, por ejemplo `urap-restaurada`, con el mismo grupo
   de seguridad `urap-rds`.
3. Cuando esté disponible, cambie el host de `DATABASE_URL` en `despliegue/.env` por el endpoint
   nuevo y reinicie el backend: `docker compose up -d backend`.
4. Compruebe que todo está bien y elimine la instancia vieja.

**Archivos.** Las evidencias están en el disco del servidor. Para copiarlas a diario, en
*EC2 → Lifecycle Manager* cree una política de *snapshots* diarios del volumen de la instancia.

Para restaurarlas:

1. *EC2 → Snapshots*: elija el del día y *Actions → Create volume from snapshot*, en la misma
   zona de disponibilidad de la instancia.
2. *Volumes → Actions → Attach volume* a la instancia `urap`.
3. En el servidor, monte el volumen (`lsblk` muestra su nombre, por ejemplo `/dev/nvme1n1p1`) y
   copie la carpeta:

   ```bash
   sudo mkdir -p /mnt/respaldo && sudo mount /dev/nvme1n1p1 /mnt/respaldo
   sudo rsync -a /mnt/respaldo/srv/urap/almacenamiento/ /srv/urap/almacenamiento/
   sudo umount /mnt/respaldo
   ```

4. Separe el volumen (*Detach volume*) y elimínelo.

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| El navegador no abre `https://DOMINIO` o el certificado no sale | El dominio no apunta a la IP elástica, o el grupo `urap-web` no tiene abiertos el 80 y el 443. Mire `docker compose logs caddy`. |
| El backend se reinicia una y otra vez | Variables inválidas o la base no responde. Mire `docker compose logs backend`: el mensaje dice qué variable falta. |
| `migrate deploy` se queda esperando y falla por tiempo | El grupo `urap-rds` no deja entrar al grupo `urap-web` (paso 3). |
| `Access denied` o error de TLS al conectar | La contraseña de `DATABASE_URL` tiene caracteres sin codificar, o falta el certificado en `/srv/urap/certificados`. |
| `docker compose build` se detiene sin mensaje claro | Falta memoria: active el intercambio del paso 5. |
| `docker compose logs caddy` dice `rateLimited` | Let's Encrypt agotó el cupo de `sslip.io` (paso 4). Caddy reintenta solo; si no puede esperar, use un subdominio propio. |
| `DATABASE_URL no se puede leer` | La contraseña tiene `@ : / ? #` sin codificar (paso 7). |
| `ssh: connect to host … Connection timed out` | Su IP cambió: vuelva a elegir **My IP** en la regla SSH de `urap-web`. |

## Apagar o borrar

- Para no consumir créditos cuando no se usa: detenga la instancia de EC2 y la de RDS (*Actions
  → Stop*). RDS se vuelve a encender sola a los 7 días.
- AWS cobra por hora cada IP pública (de los créditos del plan gratuito), y más si la IP
  elástica queda sin asociar a una instancia encendida: libérela cuando ya no la use.
- Después de la sustentación, el servidor queda con un Administrador de demostración cuya
  contraseña conoce todo el equipo: apague las instancias, o borre la base antes de cualquier uso
  real (paso 8, «Datos de demostración»). Al borrar la base, vacíe también
  `/srv/urap/almacenamiento`: los archivos que se subieron quedan huérfanos.
- Al terminar la tesis: elimine la instancia de EC2, la de RDS (puede guardar un *snapshot*
  final), la IP elástica y los *snapshots* que ya no necesite.
