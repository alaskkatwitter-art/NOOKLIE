alter table public.reading_list_items
  add column reading_status text
    check (reading_status in ('unread', 'reading', 'completed'));
