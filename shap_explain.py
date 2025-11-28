
import shap        # Importa la librería SHAP, usada para explicar modelos (aunque aquí no se usa realmente)
import sys         # Permite acceder a argumentos de la línea de comandos y funciones del sistema

# ============================================================
# Función de modelo dummy (solo para ejemplo)
# ============================================================
def dummy_model(text):
    """
    Simula un modelo que devuelve un nivel de 'confianza'
    basado únicamente en la longitud del texto recibido.
    
    La lógica es:
       - Mientras más largo el texto, mayor la "confianza".
       - Se divide entre 100 para normalizar el valor entre 0 y 1.
    
    Parámetros:
        text (str): texto de entrada.
    
    Retorna:
        float: valor entre 0.0 y 1.0 representando la confianza simulada.
    """
    return len(text) / 100  # Regresa un valor escalado

# ============================================================
# Obtener el texto desde los argumentos (línea de comando)
# ============================================================
# Si el script se ejecuta así:
#    python script.py "hola mundo"
# entonces sys.argv[1] será "hola mundo".
text = sys.argv[1] if len(sys.argv) > 1 else ""

# Ejecutar el modelo dummy para obtener la "confianza"
confidence = dummy_model(text)

# ============================================================
# Generar explicación (dummy) con SHAP o texto descriptivo
# ============================================================
if len(text) > 0:
    # Si se recibió texto, se crea una explicación simple
    explanation = f"Confianza: {confidence:.1f}/1.0 (basado en la longitud)."
else:
    # Si NO se recibió texto, se devuelve mensaje de error o vacío
    explanation = "Texto no detectado"

# Imprimir la explicación final
print(explanation)
