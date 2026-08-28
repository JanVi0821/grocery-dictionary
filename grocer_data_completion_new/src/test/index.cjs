const fuzz = require("fuzzball");

// const sourceStr =
//   "Asian Home Gourmet Coconut Curry Noodles Singapore Laksa Mild Gluten Free Spice Paste";
// const compareStr = [
//   "mamee chef noodles curry laksa",
//   "trident singapore noodles stir fry two pack",
//   "on the menu singapore noodles with beef",
//   "super mi instant noodles mi goreng bbq chicken",
//   "Cartology-Default Content-Search CIG",
//   "mi sedaap instant noodles mi goreng multi pack",
//   "indomie mi goreng instant noodles bbq chicken multi pack",
//   "indomie mi goreng instant noodles bbq chicken multi pack",
//   "indomie mi goreng instant noodles fried noodles multi pack",
//   "maggi mi goreng instant noodles soy & mild multi pack",
//   "maggi mi goreng instant noodles hot & spicy multi pack",
//   "indomie noodles mi goreng barbeque chicken",
//   "ayam curry paste malaysian laksa",
//   "indomie instant noodles mi goreng multi pack",
//   "maggi fusian instant noodles hot & spicy mi goreng cup",
//   "suimin instant noodles coconut chicken bowl",
//   "nissin instant noodles cup laksa",
//   "indomie instant noodles cup mi goreng",
//   "mie sedaap instant noodles cup mi goreng",
//   "indomie instant noodles cup bbq chicken mi goreng",
//   "asian home gourmet spice paste singapore laksa coconut curry",
//   "continental classics cup a soup asian laksa with noodles",
//   "trident instant soup thai laksa with noodles",
//   "lee kum kee ready sauce coconut curry vegetables",
//   "barker's meal base coconut curry sauce",
//   "woolworths stir fry sauce coconut & lime red curry",
//   "the spice tailor ready meal keralan coconut curry mild",
// ];


const sourceStr =
  "Kellogg's Pop Tarts Frosted Cookies & Creme Toaster Pastries";
const compareStr= [
  "kelloggs kelloggs granola high protein honey nut",
  "kelloggs kelloggs granola high protein forest berry",
  "kelloggs kelloggs cornflakes ",
  "kelloggs kelloggs granola high protein apple crumble",
  "undefined Cartology-Default Content-Search CIG",
  "kellogg's kellogg's cereal coco pops",
  "kellogg's nutrigrain kellogg's nutrigrain cereal ",
  "kellogg's crunchy nut kellogg's crunchy nut cereal cornflakes",
  "kellogg's kellogg's cereal sultana bran",
  "kellogg's just right kellogg's just right cereal original",
  "kellogg's special k kellogg's special k cereal original",
  "kellogg's coco pops kellogg's coco pops cereal chex",
  "kellogg's lcms kellogg's lcms cereal bars unicorn rice bubbles",
  "kelloggs special k kelloggs special k cereal gluten free",
  "kellogg's froot loops kellogg's froot loops cereal ",
  "kellogg's kellogg's cereal nutrigrain honey",
  "kellogg's special k kellogg's special k cereal forest berries",
  "kellogg's kellogg's cereal variety pack",
  "kelloggs kelloggs cornflakes gluten free",
  "kellogg's kellogg's cereals coco pops",
  "kellogg's kellogg's lcms cereal marshmallow",
  "kelloggs kelloggs cereal coco pops chocos",
  "kellogg's kellogg's cereal cocopops chex",
  "kellogg's crispix kellogg's crispix cereal honey",
  "kellogg's special k kellogg's special k cereal original",
  "kellogg's all bran kellogg's all bran cereal high in fibre honey almond",
  "kelloggs kelloggs cereal nutrigrain high protein",
  "kellogg's sultana bran kellogg's sultana bran cereal original",
  "kellogg's all bran kellogg's all bran cereal original",
  "kellogg's nutrigrain kellogg's nutrigrain cereal ",
  "kellogg's froot loops kellogg's froot loops cereal ",
  "kellogg's all bran kellogg's all bran cereal wheat flakes",
  "kelloggs special k gluten free kelloggs special k gluten free cereal almond & cranberry",
  "kellogg's just right kellogg's just right cereal original",
  "kellogg's nutrigrain kellogg's nutrigrain cereal ",
  "kelloggs coco pops kelloggs coco pops cereal gluten free",
  "kellogg's lcms kellogg's lcms cereal bars kaleidos rice bubbles",
  "kellogg's crunchy nut kellogg's crunchy nut cornflakes ",
  "kelloggs nutrigrain kelloggs nutrigrain cereal bars original",
  "kelloggs kelloggs cereal bars nutri grain chocolate malt",
  "kelloggs kelloggs sultana bran gluten free",
  "kellogg's lcms kellogg's lcms cereal bars split stix yoghurty",
  "kellogg's lcms kellogg's lcms cereal bars choc chip rice bubbles",
  "uncle tobys cheerios uncle tobys cheerios cereal original wholegrain",
  "woolworths woolworths cereal rice pops",
  "woolworths free from gluten woolworths free from gluten cereal honey almond crunch",
  "woolworths free from gluten woolworths free from gluten cereal chia coconut & vanilla"
]

for (const str of compareStr) {
  console.log(fuzz.token_set_ratio(sourceStr.toLocaleLowerCase(), str.toLocaleLowerCase()), str);
}


