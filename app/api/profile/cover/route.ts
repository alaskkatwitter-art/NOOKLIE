import { uploadProfileImage } from '@/lib/profile/upload-image';

export async function POST(request: Request) {
  return uploadProfileImage(request, 'cover');
}
