import * as Path from 'path'

/** Whether a media file is rendered as a still image or a video player. */
export type MediaKind = 'image' | 'video'

/** Image file extensions the viewer can render, mapped to their media type. */
const ImageMediaTypes = new Map<string, string>([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.bmp', 'image/bmp'],
  ['.ico', 'image/x-icon'],
  ['.avif', 'image/avif'],
  ['.svg', 'image/svg+xml'],
])

/** Video file extensions the viewer can render, mapped to their media type. */
const VideoMediaTypes = new Map<string, string>([
  ['.mp4', 'video/mp4'],
  ['.m4v', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.ogv', 'video/ogg'],
  ['.mov', 'video/quicktime'],
])

/** The media kind and MIME type for a path, or null when it isn't media. */
export type MediaDescriptor = {
  readonly kind: MediaKind
  readonly mediaType: string
}

/**
 * Classify a path as a renderable image or video by its extension, or return
 * null when the viewer should fall back to the text/binary code view.
 */
export function getMediaDescriptor(filePath: string): MediaDescriptor | null {
  const extension = Path.extname(filePath).toLowerCase()

  const image = ImageMediaTypes.get(extension)
  if (image !== undefined) {
    return { kind: 'image', mediaType: image }
  }

  const video = VideoMediaTypes.get(extension)
  if (video !== undefined) {
    return { kind: 'video', mediaType: video }
  }

  return null
}
