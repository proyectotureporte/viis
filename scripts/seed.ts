import 'dotenv/config';
import { getPrisma } from '../lib/prisma';
import { COURSES, DOCUMENT_TYPES, ENTITIES } from './seed-data';

/** Idempotente: se puede ejecutar en cada despliegue. Nunca borra ni pisa datos editados. */
async function main() {
  const prisma = getPrisma();
  const openv = await prisma.organization.findFirst({ where: { kind: 'OPENV' } });
  if (!openv) await prisma.organization.create({ data: { kind: 'OPENV', name: 'OpenV' } });

  for (const type of DOCUMENT_TYPES) {
    await prisma.documentType.upsert({ where: { code: type.code }, create: type, update: {} });
  }
  for (const name of ENTITIES) {
    await prisma.entity.upsert({ where: { name }, create: { name }, update: {} });
  }
  for (const course of COURSES) {
    await prisma.course.upsert({ where: { slug: course.slug }, create: course, update: {} });
  }
  console.log(`Catálogos listos: ${DOCUMENT_TYPES.length} tipos documentales, ${ENTITIES.length} entidades, ${COURSES.length} cursos.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
