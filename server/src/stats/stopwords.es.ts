/** Palabras vacías del español (sin tildes, en minúscula) + muletillas de chat. */
export const STOPWORDS = new Set(
  `
a al algo algun alguna algunas alguno algunos alla alli ambos ante antes aquel aquella aquellas
aquello aquellos aqui asi aun aunque bajo bastante bien cada casi cierta ciertas cierto ciertos
como con conmigo contigo contra cual cuales cualquier cuando cuanta cuantas cuanto cuantos de del
demas dentro desde donde dos el ella ellas ello ellos en entonces entre era eramos eran eras eres
es esa esas ese eso esos esta estaba estaban estado estais estamos estan estar estas este esto
estos estoy etc fue fueron fui fuimos ha haber habia habian han has hasta hay haya he hemos hice
hizo hoy la las le les lo los mas me mi mia mias mio mios mis mismo mucha muchas mucho muchos muy
nada nadie ni ninguna ninguno no nos nosotras nosotros nuestra nuestras nuestro nuestros nunca o
os otra otras otro otros para pero poco por porque pues que quien quienes se sea sean segun ser
si sido siempre sin sino sobre sois solo somos son soy su sus suya suyas suyo suyos tal tambien
tampoco tan tanto te tendra tener tengo ti tiene tienen toda todas todo todos tu tus tuya tuyo un
una unas uno unos usted ustedes va vais vamos van vaya voy vosotros vuestra vuestro y ya yo
aca ahi ahora alguien algunx cosa cosas creo decir dice dicen digo dijo donde esten estes estuve
fuera hace hacen hacer hacia haga hago hola igual luego mejor menos mientras parece puede pueden
puedo quiero quieres sabe saben se sera seria serian sigue sin solo tener tenia toda vez veces
ver vez vos dia dias cual cuales tipo onda bueno buena buenas buenos gracias favor porfa pos
q k xq pq tb tmb tbn ok okay oka si no aja uff wow jaja jajaja jeje jiji xd lol
`
    .split(/\s+/)
    .filter(Boolean),
);
