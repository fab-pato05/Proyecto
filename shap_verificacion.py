import pandas as pd
import shap
import json
import sys
import os
import joblib # Para persistir el modelo

# Configuración y Carga del Modelo 

MODEL_PATH = "random_forest_model.joblib"

# 1. Cargar datos 
try:
    data = pd.read_csv("verificaciones.csv")
except FileNotFoundError:
    print("Advertencia: No se encontró 'verificaciones.csv'. El modelo debe existir para correr.")
    data = pd.DataFrame()

# Convertir variables categóricas/booleanas a numéricas (Solo si se entrena un nuevo modelo)
if not data.empty:
    data['tipoDocumentoDetectado'] = data['tipoDocumentoDetectado'].map({
        'DUI': 0, 'Pasaporte': 1, 'DESCONOCIDO': 2
    })
    data['OCR_match'] = data['OCR_match'].astype(int)
    # ⚠️ Usamos 'match_result' (BOOLEAN/int) como nuestro target para el entrenamiento
    data['match_result'] = data['match_result'].astype(int) 
    data['edad_valida'] = data['edad_valida'].astype(int)

# 2. Definición de Features y Target (Consistente con los datos de tu BD)
FEATURE_COLUMNS = ['similarityScore', 'liveness', 'tipoDocumentoDetectado', 'OCR_match', 'edad_valida']
TARGET_COLUMN = 'match_result'

# 3. Cargar o Entrenar RandomForest
if os.path.exists(MODEL_PATH):
    print("Cargando modelo existente...")
    model = joblib.load(MODEL_PATH)
else:
    print("Modelo no encontrado. Entrenando nuevo modelo...")
    if data.empty:
        sys.exit(json.dumps({"error": "No se puede entrenar: 'verificaciones.csv' no encontrado."}))

    from sklearn.model_selection import train_test_split
    from sklearn.ensemble import RandomForestClassifier

    X = data[FEATURE_COLUMNS]
    y = data[TARGET_COLUMN]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)

    # Guardar el modelo para uso futuro
    joblib.dump(model, MODEL_PATH)

# 4. SHAP Explainer
explainer = shap.TreeExplainer(model)

# Función para explicar un nuevo registro
def explicar_verificacion(nueva_verificacion: dict):
    """
    nueva_verificacion: dict con keys:
        similarityScore, liveness, tipoDocumentoDetectado, OCR_match, edad_valida
    """
    
    #  Asegurar que todas las features existen, usando 0 como default si es necesario
    for col in FEATURE_COLUMNS:
        if col not in nueva_verificacion:
            nueva_verificacion[col] = 0
            
    # Convertir a dataframe para la predicción
    df = pd.DataFrame([nueva_verificacion])
    
    # Mapeo de valores categóricos
    df['tipoDocumentoDetectado'] = df['tipoDocumentoDetectado'].map({'DUI':0, 'Pasaporte':1, 'DESCONOCIDO':2}).fillna(2) # Usar 2 para desconocido
    
    # Asegurar tipos numéricos
    df['OCR_match'] = df['OCR_match'].astype(int)
    df['liveness'] = df['liveness'].astype(int)
    df['edad_valida'] = df['edad_valida'].astype(int)
    
    # Predicción
    pred = model.predict(df)[0]
    pred_prob = model.predict_proba(df)[0][pred]
    
    # SHAP valores (shap_values[1] para la clase APROBADO=1)
    shap_values = explainer.shap_values(df)
    feature_importance = dict(zip(FEATURE_COLUMNS, shap_values[1][0].tolist()))
    
    resultado = {
        "prediccion": "APROBADO" if pred == 1 else "RECHAZADO",
        "probabilidad": float(pred_prob),
        "shap": feature_importance
    }
    return resultado


# 5. Ejecución Principal (Lee JSON de la línea de comandos)
if __name__ == "__main__":
    
    if len(sys.argv) > 1:
        try:
            # Captura el JSON enviado desde Node.js
            input_json = sys.argv[1]
            nueva_verificacion = json.loads(input_json)
        except json.JSONDecodeError:
            print(json.dumps({"error": "Error decodificando el JSON de entrada."}))
            sys.exit(1)
    else:
        # Ejemplo de ejecución local si no se pasa el JSON
        nueva_verificacion = {
            "similarityScore": 92.1,
            "liveness": 1,
            "tipoDocumentoDetectado": "DUI",
            "OCR_match": 1,
            "edad_valida": 1
        }
    
    try:
        resultado = explicar_verificacion(nueva_verificacion)
        # Imprimir el resultado final en stdout para que Node.js lo capture
        print(json.dumps(resultado))
    except Exception as e:
        print(json.dumps({"error": f"Error procesando la verificación: {str(e)}"}))
        sys.exit(1)
        # ... (Código Python anterior, incluyendo la carga del modelo y el explainer)

# Función para explicar un nuevo registro
def explicar_verificacion(nueva_verificacion_dict):
    # 1. Convertir el diccionario de entrada a DataFrame de Pandas
    df = pd.DataFrame([nueva_verificacion_dict])

    # 2. Preprocesamiento (Asegurar que sea idéntico al entrenamiento)
    # A) Mapeo de tipoDocumentoDetectado
    df['tipoDocumentoDetectado'] = df['tipoDocumentoDetectado'].map({
        'DUI': 0, 'Pasaporte': 1, 'DESCONOCIDO': 2
    })
    
    # B) Asegurar que todas las columnas de entrada están presentes
    df = df[FEATURE_COLUMNS]

    # 3. Predicción y SHAP
    # Hacemos la predicción para saber si fue APROBADO (1) o RECHAZADO (0)
    prediccion = model.predict(df)[0]
    
    # SHAP values (shap_values[1] es la explicación para la clase APROBADO)
    shap_values = explainer.shap_values(df)
    
    # Creamos un diccionario de importancia de características
    feature_importance = {}
    for i, feature in enumerate(FEATURE_COLUMNS):
        # Tomamos el valor SHAP para la clase "APROBADO" (índice 1)
        feature_importance[feature] = shap_values[1][0][i]
        
    resultado = {
        "prediccion": "APROBADO" if prediccion == 1 else "RECHAZADO",
        "probabilidad_aprobacion": model.predict_proba(df)[0][1].item(), # Probabilidad de clase 1
        "explicacion_shap": feature_importance
    }
    return resultado

# 5. Lógica de Ejecución Principal (Capturando la entrada de Node.js)
if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Los datos vienen como el segundo argumento (índice 1)
        input_json = sys.argv[1]
        try:
            # Parseamos el JSON de entrada de Node.js
            datos_verificacion = json.loads(input_json)
            
            # Aquí aseguramos que todas las 5 características esperadas por el modelo están presentes.
            if not all(k in datos_verificacion for k in FEATURE_COLUMNS):
                 sys.exit(json.dumps({"error": "Datos de entrada incompletos. Se requieren: " + ", ".join(FEATURE_COLUMNS)}))

            # Ejecutar la explicación
            resultado_shap = explicar_verificacion(datos_verificacion)
            
            # Imprimir el JSON a stdout para que Node.js lo capture
            print(json.dumps(resultado_shap))
            
        except json.JSONDecodeError:
            sys.exit(json.dumps({"error": "Error al decodificar JSON de entrada."}))
        except Exception as e:
            # Captura cualquier otro error del proceso SHAP/modelo
            sys.exit(json.dumps({"error": f"Error en la explicación SHAP: {e}"}))
    else:
        sys.exit(json.dumps({"error": "No se proporcionaron datos de verificación."}))