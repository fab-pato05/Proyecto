import shap
import sys 
#Modelo dummy para explicar 
def dummy_model(text): 
    #simula confianza basada en la longuitud 
    return len(text) / 100 #valor entre el 0 y 1 
text = sys.argv[1] if len(sys.argv) > 1 else ""
confidence = dummy_model(text)

#explicacion corta con shap 
if len(text) > 0: 
    explanation = f"Confianza: {confidence:.1f}/1.0 (basado en la longuitud)."
else: 
    explanation = "texto no detectado"
    print(explanation)