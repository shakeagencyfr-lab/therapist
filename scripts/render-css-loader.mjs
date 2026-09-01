// Résout les imports CSS vers un module vide : le banc rend le balisage, pas le style.
export async function resolve(specifier, context, next) {
  if (specifier.endsWith('.css')) {
    return { url: 'data:text/javascript,export default new Proxy({},{get:(_,k)=>String(k)})', shortCircuit: true }
  }
  return next(specifier, context)
}
