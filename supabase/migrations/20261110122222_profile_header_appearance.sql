ALTER TABLE public.profiles
  ADD COLUMN header_layout text NOT NULL DEFAULT 'classic'
    CONSTRAINT profiles_header_layout_check CHECK (header_layout IN ('classic', 'immersive')),
  ADD COLUMN avatar_position text NOT NULL DEFAULT 'left'
    CONSTRAINT profiles_avatar_position_check CHECK (avatar_position IN ('left', 'right'));
