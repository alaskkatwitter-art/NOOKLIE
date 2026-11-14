import { optimizeUploadedImage } from '@/lib/media/optimize-upload';
import { imageMatchesType } from '@/lib/security/uploads';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function POST(request: Request) {
  try {
    const cookieHeader = request.headers.get('cookie') || '';

    const sessionCookie = cookieHeader
      .split(';')
      .map((cookie) => cookie.trim())
      .find((cookie) =>
        cookie.startsWith('toriland_session=')
      );

    if (!sessionCookie) {
      return NextResponse.json(
        { error: 'Você precisa estar logado.' },
        { status: 401 }
      );
    }

    const sessionToken = decodeURIComponent(
      sessionCookie.substring('toriland_session='.length)
    );

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'Sessão inválida.' },
        { status: 401 }
      );
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(sessionToken)
      .digest('hex');

    const { data: session, error: sessionError } =
      await supabase
        .from('auth_sessions')
        .select('user_id, expires_at')
        .eq('token_hash', tokenHash)
        .maybeSingle();

    if (
      sessionError ||
      !session ||
      new Date(session.expires_at).getTime() <= Date.now()
    ) {
      return NextResponse.json(
        { error: 'Sua sessão expirou. Entre novamente.' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Nenhuma imagem foi enviada.' },
        { status: 400 }
      );
    }

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error:
            'Formato inválido. Use JPG, PNG ou WEBP.',
        },
        { status: 400 }
      );
    }

    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json(
        {
          error:
            'A imagem de capa pode ter no máximo 8 MB.',
        },
        { status: 400 }
      );
    }

    const extension =
      file.type === 'image/jpeg'
        ? 'jpg'
        : file.type === 'image/png'
        ? 'png'
        : 'webp';

    const filePath = `${session.user_id}/cover-${Date.now()}.${extension}`;

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    if (!imageMatchesType(fileBuffer, file.type)) {
      return NextResponse.json({ error: 'O conteúdo do arquivo não corresponde ao formato da imagem.' }, { status: 415 });
    }


    const optimizedBuffer = await optimizeUploadedImage(fileBuffer, file.type, 1600);

    const { error: uploadError } =
      await supabase.storage
        .from('profile-covers')
        .upload(filePath, optimizedBuffer, {
          contentType: file.type,
          cacheControl: '3600',
          upsert: false,
        });

    if (uploadError) {
      return NextResponse.json(
        {
          error:
            'Não foi possível enviar a imagem de capa.',
        },
        { status: 500 }
      );
    }

    const { data: publicUrlData } =
      supabase.storage
        .from('profile-covers')
        .getPublicUrl(filePath);

    const coverUrl = publicUrlData.publicUrl;

    const { error: profileError } =
      await supabase
        .from('profiles')
        .update({
          cover_url: coverUrl,
        })
        .eq('user_id', session.user_id);

    if (profileError) {
      await supabase.storage
        .from('profile-covers')
        .remove([filePath]);

      return NextResponse.json(
        {
          error:
            'A imagem foi enviada, mas não foi possível atualizar o perfil.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Capa atualizada com sucesso.',
      cover_url: coverUrl,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          'Não foi possível atualizar sua capa.',
      },
      { status: 500 }
    );
  }
}
