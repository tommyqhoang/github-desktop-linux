import { getMediaDescriptor } from '../../../src/lib/file-tree/media'

describe('getMediaDescriptor', () => {
  it('classifies common image extensions', () => {
    expect(getMediaDescriptor('logo.png')).toEqual({
      kind: 'image',
      mediaType: 'image/png',
    })
    expect(getMediaDescriptor('photo.JPG')?.kind).toBe('image')
    expect(getMediaDescriptor('icon.svg')).toEqual({
      kind: 'image',
      mediaType: 'image/svg+xml',
    })
  })

  it('classifies common video extensions', () => {
    expect(getMediaDescriptor('clip.mp4')).toEqual({
      kind: 'video',
      mediaType: 'video/mp4',
    })
    expect(getMediaDescriptor('movie.WEBM')?.kind).toBe('video')
  })

  it('returns null for non-media files', () => {
    expect(getMediaDescriptor('index.ts')).toBeNull()
    expect(getMediaDescriptor('README.md')).toBeNull()
    expect(getMediaDescriptor('noextension')).toBeNull()
  })
})
