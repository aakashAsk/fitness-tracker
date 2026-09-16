// Profile picture: pick or shoot, crop, upload to Cloudinary, and hand
// back a delivery URL for the profile document.
//
// The crop step is expo-image-picker's own `allowsEditing` UI rather
// than a cropper of our own. It is the platform's native editor, so it
// behaves the way the user expects from every other app on the device,
// and it runs before anything is uploaded — we never store a full-size
// original we would then have to clean up.
//
// UPLOADS ARE UNSIGNED, and deliberately so. A signed upload needs the
// Cloudinary API secret, and there is nowhere in a React Native app to
// put a secret: everything in the bundle, EXPO_PUBLIC_* included, ships
// to the device and can be read out of the APK. An unsigned preset
// carries no credentials, so the worst an extracted config allows is
// uploading into the preset's own folder — which is why that preset
// should stay narrow (see .env.example).
import * as ImagePicker from 'expo-image-picker';
import { getCurrentUserId } from './userService';

/** Square, and small enough that a slow connection still finishes. */
const AVATAR_ASPECT: [number, number] = [1, 1];
const AVATAR_QUALITY = 0.7;

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export type AvatarSource = 'camera' | 'library';

/** What the picker hands back, ready to upload. */
export interface PickedImage {
  /** Local file uri — kept for previewing, not for uploading. */
  uri: string;
  /** The image itself, base64-encoded. See uploadAvatar for why. */
  base64: string;
  /** e.g. "image/jpeg" — absent on some Android providers. */
  mimeType: string | null;
}

export class AvatarError extends Error {
  /** True when the user declined a permission — callers word that
      differently from a genuine failure. */
  permissionDenied: boolean;

  constructor(message: string, permissionDenied = false) {
    super(message);
    this.name = 'AvatarError';
    this.permissionDenied = permissionDenied;
  }
}

/**
 * Opens the camera or the photo library with the native crop UI.
 *
 * Resolves to null when the user backs out — that is an ordinary
 * outcome, not an error, so it is not thrown.
 */
export async function pickAvatar(source: AvatarSource): Promise<PickedImage | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new AvatarError(
      source === 'camera'
        ? 'PulseFit needs camera access to take a profile picture. You can grant it in Settings.'
        : 'PulseFit needs photo access to choose a profile picture. You can grant it in Settings.',
      true,
    );
  }

  const options: ImagePicker.ImagePickerOptions = {
    // A MediaType array — the MediaTypeOptions enum is deprecated in
    // SDK 57.
    mediaTypes: ['images'],
    // The native crop UI, locked square so the result matches the
    // circular avatar it ends up in.
    allowsEditing: true,
    aspect: AVATAR_ASPECT,
    quality: AVATAR_QUALITY,
    base64: true,
  };

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled) return null;

  const asset = result.assets?.[0];
  if (!asset?.base64) {
    throw new AvatarError('That image could not be read. Try another one.');
  }

  return {
    uri: asset.uri,
    base64: asset.base64,
    mimeType: asset.mimeType ?? null,
  };
}

interface CloudinaryResponse {
  secure_url?: string;
  error?: { message?: string };
}

/**
 * Uploads the cropped image and returns its HTTPS delivery URL.
 *
 * The file goes up as a base64 Data URI, which Cloudinary accepts for
 * `file` alongside raw bytes and remote URLs.
 *
 * The obvious alternative — appending {uri, name, type} and letting the
 * native layer stream the file off disk — does NOT work here. Expo SDK
 * 57 replaces the global fetch with its own implementation, and that
 * one converts FormData in JS: it handles strings and real Blobs, and
 * throws "Unsupported FormDataPart implementation" on React Native's
 * uri-shaped parts. A Data URI is a plain string, so both parts of this
 * request are of a kind every fetch implementation understands.
 *
 * Each user's picture goes to a fixed public_id — their uid — so a new
 * one REPLACES the previous rather than piling up beside it. That is
 * how an old avatar gets removed: not by deleting it, which needs the
 * API secret and therefore a backend, but by never letting a second
 * copy exist.
 *
 * Replacing in place requires the preset itself to allow it: see
 * .env.example for the two toggles. `overwrite` cannot be sent as a
 * request parameter on an unsigned upload, only configured on the
 * preset.
 */
export async function uploadAvatar(image: PickedImage, userId?: string): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new AvatarError(
      'Image uploads are not configured. Set EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and ' +
        'EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET in your .env, then restart the bundler.',
    );
  }

  const mimeType = image.mimeType ?? 'image/jpeg';
  const uid = userId ?? getCurrentUserId();

  const form = new FormData();
  form.append('file', `data:${mimeType};base64,${image.base64}`);
  form.append('upload_preset', UPLOAD_PRESET);
  // One id per user, so every upload lands on the same asset. The
  // folder comes from the preset, not from here.
  form.append('public_id', uid);

  let response: Response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: form,
      // Content-Type is deliberately unset: fetch has to add the
      // multipart boundary itself, and naming the type here overwrites
      // it with one that has no boundary, which Cloudinary rejects.
    });
  } catch (error) {
    throw new AvatarError(
      `Could not reach the image service. Check your connection and try again. (${
        (error as Error).message
      })`,
    );
  }

  let payload: CloudinaryResponse;
  try {
    payload = (await response.json()) as CloudinaryResponse;
  } catch {
    throw new AvatarError(`Upload failed (${response.status}).`);
  }

  if (!response.ok || !payload.secure_url) {
    // Cloudinary puts the useful part in error.message — e.g. an
    // unknown preset, one still set to signed, or a preset that does
    // not permit overwriting an existing public_id.
    throw new AvatarError(
      payload.error?.message ?? `Upload failed (${response.status}). Please try again.`,
    );
  }

  // Returned rather than rebuilt from the public_id on purpose: because
  // every upload overwrites the same asset, the id alone would give a
  // URL identical to last time's, and both Cloudinary's CDN and React
  // Native's Image cache would keep serving the previous picture.
  // secure_url carries a /v<version>/ segment that changes on every
  // upload, so storing it verbatim busts both caches.
  return payload.secure_url;
}
