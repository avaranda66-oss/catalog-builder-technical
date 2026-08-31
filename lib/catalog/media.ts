export const CLOUD_IMAGE_LIMIT = 8 * 1024 * 1024
export const LOCAL_IMAGE_LIMIT = 500 * 1024
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function validateImageFile(file: Pick<File, 'type' | 'size' | 'name'>, local: boolean): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return `${file.name}: use JPEG, PNG ou WebP.`
  const limit = local ? LOCAL_IMAGE_LIMIT : CLOUD_IMAGE_LIMIT
  if (file.size > limit) return `${file.name}: limite de ${local ? '500 KB no modo local' : '8 MB por imagem'}.`
  if (!file.size) return `${file.name}: arquivo vazio.`
  return null
}

export function mediaUploadPath(sku: string, type: string, id: string): string {
  const folder = sku.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'produto'
  const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
  return `products/${folder}/${id}.${extension}`
}
