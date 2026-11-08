// Rodar: node --test "src/lib/agente-mapa.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { coordenadasDoLinkMaps, linkMapsDe } from "./agente-mapa.ts";

test("lê o @lat,lng do link de lugar", () => {
  assert.deepEqual(
    coordenadasDoLinkMaps("https://www.google.com/maps/place/Paraty/@-23.21,-44.71,17z/data=x"),
    { latitude: -23.21, longitude: -44.71 },
  );
});

test("lê ?q= e query=", () => {
  assert.deepEqual(coordenadasDoLinkMaps("https://maps.google.com/?q=-23.21,-44.71"), {
    latitude: -23.21,
    longitude: -44.71,
  });
  assert.deepEqual(
    coordenadasDoLinkMaps("https://www.google.com/maps/search/?api=1&query=-23.2178,-44.7131"),
    { latitude: -23.2178, longitude: -44.7131 },
  );
  assert.deepEqual(coordenadasDoLinkMaps("https://maps.google.com/?q=-23.21%2C-44.71"), {
    latitude: -23.21,
    longitude: -44.71,
  });
});

test("prefere o pin (!3d!4d) ao centro do mapa (@)", () => {
  assert.deepEqual(
    coordenadasDoLinkMaps(
      "https://www.google.com/maps/place/X/@-23.30,-44.80,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-23.2101!4d-44.7102",
    ),
    { latitude: -23.2101, longitude: -44.7102 },
  );
});

test("aceita o par de coordenadas colado sozinho", () => {
  assert.deepEqual(coordenadasDoLinkMaps(" -23.21, -44.71 "), {
    latitude: -23.21,
    longitude: -44.71,
  });
});

test("devolve null para link sem coordenadas ou fora da faixa", () => {
  assert.equal(coordenadasDoLinkMaps("https://maps.app.goo.gl/abc123"), null);
  assert.equal(coordenadasDoLinkMaps(""), null);
  assert.equal(coordenadasDoLinkMaps("https://maps.google.com/?q=123.0,-44.71"), null);
});

test("monta o link de volta", () => {
  assert.equal(
    linkMapsDe(-23.21, -44.71),
    "https://www.google.com/maps/search/?api=1&query=-23.21,-44.71",
  );
});
