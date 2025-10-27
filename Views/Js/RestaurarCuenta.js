import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import db from "./db.js"; // Ajusta si tu conexión se llama diferente
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());

// =============== SEND RESET LINK ==================
app.post("/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;

        const user = await db.users.findOne({ where: { email } });
        if (!user) return res.status(400).json({ msg: "Correo no encontrado" });

        // Crear token (15 min)
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
            expiresIn: "15m",
        });

        // Configurar envío de correo
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        });

        const link = `${process.env.FRONTEND_URL}/reset-password/${token}`;

        await transporter.sendMail({
            to: email,
            subject: "Recuperación de contraseña",
            html: `
        <h3>Recuperación de contraseña</h3>
        <p>Da clic en el siguiente enlace para recuperar tu cuenta:</p>
        <a href="${link}">${link}</a>
        <p>El enlace expira en 15 minutos.</p>
      `,
        });

        res.json({ msg: "Correo enviado correctamente" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ msg: "Error del servidor" });
    }
});

// =============== RESET PASSWORD ==================
app.post("/reset-password/:token", async (req, res) => {
    try {
        const { token } = req.params;
        const { newPassword } = req.body;

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const hash = await bcrypt.hash(newPassword, 10);

        await db.users.update(
            { password: hash },
            { where: { id: decoded.id } }
        );

        res.json({ msg: "Contraseña cambiada correctamente" });
    } catch (err) {
        return res.status(400).json({ msg: "Token inválido o expirado" });
    }
});
