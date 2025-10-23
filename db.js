// db.js
//const { Pool } = require('pg');

// Configuración de conexión
//const pool = new Pool({
//user: 'postgres',        //  usuario de PostgreSQL
//host: 'localhost',       // IP del servidor
//database: 'circulo_seguro',  // nombre de  base de datos
//password: '1234', // la contraseña del usuario postgres
//port: 5432,              // puerto por defecto
//});

// Probar la conexión
//pool.connect()
//.then(() => console.log('✅ Conectado a PostgreSQL correctamente'))
//.catch(err => console.error('❌ Error de conexión:', err));

//module.exports = pool;
// db.js
// db.js
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT || 5432,
    ssl: { rejectUnauthorized: false }
});

export default pool;


