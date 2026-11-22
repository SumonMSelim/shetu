import { chromium } from "playwright";

const b = await chromium.launch();
const p = await b.newPage();
await p.goto("https://www.universityadmissions.se/intl/search", {
  waitUntil: "domcontentloaded",
  timeout: 45000,
});
await p.waitForTimeout(8000);

const parseSok = (text: string) =>
  JSON.parse(text.replace(/^\)\]\}',?\s*/, "")) as {
    sokresultatItems: { anmalningsalternativ?: { titel?: string } }[];
    totaltAntalTraffar?: number;
  };

const post = async (body: unknown) => {
  const res = await p.request.post("https://www.universityadmissions.se/intl/api/sok", {
    data: body,
  });
  return parseSok(await res.text());
};

const base = { sortering: "nameAsc", sokfilter: { program: true, avanceradNiva: true } };
const first = (d: { sokresultatItems: { anmalningsalternativ?: { titel?: string } }[] }) =>
  d.sokresultatItems[0]?.anmalningsalternativ?.titel;

const p1 = await post({ ...base, sida: 1 });
const pVisade = await post({ ...base, antalVisade: 100 });
const pVisade2 = await post({ ...base, antalVisade: 100, sida: 2 });
const pKeep = await post({ ...base, sida: 2, keepPages: true });

console.log(
  JSON.stringify(
    {
      total: p1.totaltAntalTraffar,
      baseCount: p1.sokresultatItems.length,
      baseFirst: first(p1),
      visadeCount: pVisade.sokresultatItems.length,
      visadeFirst: first(pVisade),
      visadeSida2First: first(pVisade2),
      keepSida2First: first(pKeep),
      keepSida2Count: pKeep.sokresultatItems.length,
    },
    null,
    1,
  ),
);
await b.close();
