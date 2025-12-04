# Sistema de Pruebas de Vida (Liveness Detection)

##  Arquitectura del Sistema

La arquitectura se divide en dos grandes componentes: **Frontend** y **Backend**, apoyados por servicios adicionales como Redis, PostgreSQL, OCR y AWS Rekognition.

##  Frontend

El frontend gestiona la interacción con el usuario y la captura de datos biométricos.

### Tecnologías y Componentes

#### Main.js

* Implementa la verificación biométrica usando la cámara y documentos de identidad.
* Gestiona variables clave, visualización de la cámara, estados de documentos y acciones del usuario.

#### Funciones principales

* Mostrar instrucciones y mensajes.
* Registrar y validar acciones solicitadas.
* Obtener información del dispositivo.

#### Media Recorder

* Permite grabar video en tiempo real.
* Genera un **blob de evidencia** para enviar al backend.

#### Validación de Documentos

* Acepta solo formatos **JPG/PNG*
* Tamaño máximo: **6 MB**.
* Incluye previsualización.

#### MediaPipe (FaceMesh + Pose)

* Detecta rostro y puntos clave para validar:

  * Parpadeo.
  * Sonrisa.
  * Movimientos de cabeza.
* Añade detección corporal para verificar que se trata de una persona real.

### Flujo de acciones del Frontend

1. Verificar documento subido.
2. Generar instrucciones aleatorias.
3. Iniciar grabación.
4. Validar que el usuario cumpla las acciones.
5. Enviar documento + video al backend.

##  Backend

El backend procesa y almacena datos de forma segura.

### Tecnologías y Componentes

**Node.js + Express**: API principal.
 **Multer**: Recepción de archivos.
 **SHAP**: Mejora de imágenes.
 **AWS Rekognition**: Comparación facial.
 **Redis**: Logs temporales y conteo de intentos.
 **PostgreSQL**: Base de datos.
 **FFmpeg**: Extracción de frames del video.
 **NodeMailer**: Notificaciones al usuario.
 **Crypto, bcrypt, JWT**: Seguridad.

### Seguridad del Sistema

* **Helmet** para cabeceras seguras.
* **Rate Limit** por IP.
* **AES-256** para encriptación de biometría.

### **Procesamiento del Documento**

* Uso de **Tesseract OCR** para texto.
* Identificación automática del tipo de documento (DUI/Pasaporte).
* Extracción de rostro.
* Comparación selfie vs documento mediante **AWS Rekognition**.

### **Endpoints Principales**

* Validación de documento.
* OCR y detección del tipo de documento.
* Extracción y comparación de rostro.
* Registro de verificación en PostgreSQL.
* Conteo de intentos en Redis.
* Respuesta final al frontend.

### **Notificaciones**

* Envío de correo indicando:

  * Éxito.
  * Fallo.
  * Revisión manual.

##  Uso de Redis

Redis es usado para:

* Guardar rostros temporales.
* Contar intentos por usuario.
* Mantener logs recientes de verificación.


## 4. Resumen de Funcionalidades

### Frontend

* Captura y validación de documentos.
* Captura de selfie/video.
* Detección biométrica en tiempo real.
* Flujo guiado de acciones aleatorias.

### Backend

* Procesamiento OCR.
* Comparación facial con AWS Rekognition.
* Encriptación y seguridad.
* Registro de resultados.
* Notificaciones por correo.


## 5. Instalación

### Requisitos Previos

* Node.js 18+ instalado
* PostgreSQL configurado
* Redis en ejecución
* FFmpeg instalado
* Cuenta y credenciales de AWS (Rekognition)
* Variables de entorno configuradas en un archivo `.env`

### 1. Clonar el repositorio

```bash
 git clone https://github.com/usuario/proyecto-liveness.git
 cd proyecto-liveness
```

### 2. Instalar dependencias

```bash
 npm install
```

### 3. Configurar variables de entorno (.env)

Ejemplo:

```env
PORT=4000
DB_HOST=localhost
DB_USER=postgres
DB_PASS=password
DB_NAME=liveness_db

REDIS_URL=redis://localhost:6379

AWS_ACCESS_KEY_ID=XXXX
AWS_SECRET_ACCESS_KEY=XXXX
AWS_REGION=us-east-1

JWT_SECRET=clave-segura
```

### 4. Iniciar el servidor

```bash
 npm run dev
```

O modo producción:

```bash
 npm start
```

### 5. Levantar el frontend

Solo abre el archivo `index.html` en un servidor local o usa:

```bash
 npx serve .
```

---

## 6. Uso del Sistema

### **1. Subir el documento**

* Seleccionar imagen (JPG/PNG máximo 6MB).
* El sistema valida el formato y muestra previsualización.

### **2. Encender la cámara**

El sistema detectará automáticamente:

* Rostro
* Parpadeo
* Sonrisa
* Movimientos de cabeza

### **3. Completar acciones aleatorias**

El sistema solicitará instrucciones como:

* "Parpadea dos veces"
* "Gira la cabeza a la izquierda"
* "Sonríe"

### **4. Grabación del video**

El sistema graba breves clips como evidencia.

### **5. Envío al backend**

Se envía:

* Documento
* Frames extraídos del video
* Metadatos de la verificación

### **6. Procesamiento y resultado**

El backend:

* Extrae texto del documento (OCR)
* Detecta tipo de documento
* Compara rostros (AWS Rekognition)
* Guarda registro en PostgreSQL y Redis

El usuario recibe:

* **Éxito**
* **Fallo**
* **Revisión manual** (si algo no coincide)

