import json, re
w=open('vector-voz.js',encoding='utf-8').read()
b=open('src/backend.js',encoding='utf-8').read()
marca="const MODELO_GRATIS"
i=b.index(marca)
out=b[:i]+"// Widget completo (generado desde vector-voz.js; no editar a mano)\nconst WIDGET_JS = "+json.dumps(w, ensure_ascii=False)+";\n\n"+b[i:]
open('vera-voz-worker.js','w',encoding='utf-8').write(out)
print(len(out))
