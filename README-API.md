# Configurar la automatización con API-Football

## Qué hace y qué no hace

- **Automático**: descargar resultados reales y próximos partidos de Primera y Segunda, actualizar el Elo de los equipos solo con pulsar un botón, crear equipos nuevos que aún no tuvieras en tu base al importarlos.
- **Manual, a propósito**: lesiones y sanciones. Las he dejado fuera de la automatización porque el free tier de API-Football (y en general casi cualquier API asequible) tiene datos de bajas incompletos y con retraso, especialmente en Segunda y Liga F — peor que no tener el dato es tener un dato de bajas erróneo metido en el modelo sin que lo notes. El formulario manual por jugador que ya tenías sigue siendo la fuente fiable para esto.
- **Liga F**: pendiente de tu verificación (ver paso 3). No quise adivinar el ID ni prometerte una cobertura que luego resulte no estar disponible en el plan gratuito.

## Pasos

### 1. Consigue tu clave gratuita
Ve a [api-football.com](https://www.api-football.com) → Sign up → panel del dashboard → copia tu API Key (plan gratuito: 100 peticiones/día, sin tarjeta de crédito).

### 2. Guárdala como Secret del repo (nunca la subas al código)
En tu repositorio de GitHub: **Settings → Secrets and variables → Actions → New repository secret**
- Name: `API_FOOTBALL_KEY`
- Value: tu clave

### 3. Verifica el ID de Liga F (Primera y Segunda ya están puestos: 140 y 141)
Desde tu ordenador, con Node instalado:
```
API_FOOTBALL_KEY=tu_clave node scripts/find-league-id.js "Liga F"
```
Te dará el ID correcto y si tu plan cubre sus fixtures. Rellénalo en `data/leagues-config.json`, campo `liga_f.id`, y borra la nota `_pendiente`.

### 4. Lanza la Action manualmente la primera vez
En GitHub: pestaña **Actions → Actualizar datos de Quiniela → Run workflow**. Tarda unos segundos y genera `data/resultados.json` y `data/proximos.json` con datos reales. A partir de ahí corre sola los lunes y jueves.

### 5. Úsalo desde la web
- **Pestaña Jornada → "↓ Importar API"**: te lista los próximos partidos de Primera/Segunda (y Liga F si la activaste) para que marques cuáles quieres meter en la columna de esta semana. Los equipos que no tengas ya en tu base se crean solos con Elo inicial 1500 — ajústalo a mano en Equipos si tienes mejor criterio sobre su nivel real.
- **Pestaña Historial → "↓ Sincronizar API"**: aplica automáticamente todos los resultados reales nuevos al Elo de los equipos. Puedes seguir marcando resultados a mano con los botones 1/X/2 para jornadas antiguas o si prefieres no depender de la Action.

## Por qué no se llama a la API directamente desde el navegador

Dos razones, no una sola preferencia de diseño:
1. **Seguridad**: tu web es un repo público en GitHub Pages. Cualquier clave puesta en el JavaScript del navegador queda visible para cualquiera que abra el código fuente — te la robarían y gastarían tu cuota en horas.
2. **Compatibilidad**: la mayoría de APIs de datos (incluida esta) están pensadas para llamarse desde un servidor, no desde un navegador, y no siempre devuelven las cabeceras CORS necesarias para que `fetch()` funcione desde `tu-usuario.github.io`.

La GitHub Action resuelve ambas cosas: corre en los servidores de GitHub (nunca en el navegador de nadie), tiene la clave a salvo como Secret, y dos ficheros JSON son lo único que se publica — dato inofensivo, no una puerta a tu clave.
