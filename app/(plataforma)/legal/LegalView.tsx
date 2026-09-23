import type { LegalDocument } from '@/lib/legal';

/** Render web de un documento legal (el mismo contenido que muestra la app). */
export function LegalView({ doc }: { doc: LegalDocument }) {
  return (
    <article>
      <h1>{doc.title}</h1>
      {doc.meta && <p className="ov-meta">{doc.meta}</p>}
      {doc.sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs?.map((p) => <p key={p}>{p}</p>)}
          {section.bullets && (
            <ul>
              {section.bullets.map((b) => (
                <li key={b.text}>{b.title && <strong>{b.title}: </strong>}{b.text}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}
