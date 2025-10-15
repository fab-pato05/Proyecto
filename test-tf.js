const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-backend-wasm');
const faceapi = require('@vladmandic/face-api');

(async () => {
  console.log('🔄 Cargando backend WASM...');
  await tf.setBackend('wasm');
  await tf.ready();
  console.log('✅ TensorFlow.js con backend WASM listo');

  await faceapi.nets.tinyFaceDetector.loadFromDisk('./models');
  console.log('✅ Modelos cargados correctamente');

  // Ejemplo: detectar caras en una imagen
  const canvas = require('canvas');
  const { Canvas, Image } = canvas;
  faceapi.env.monkeyPatch({ Canvas, Image });

  const img = await canvas.loadImage('./foto.jpg');
  const detections = await faceapi.detectAllFaces(img, new faceapi.TinyFaceDetectorOptions());

  console.log(`👀 Caras detectadas: ${detections.length}`);
})();

