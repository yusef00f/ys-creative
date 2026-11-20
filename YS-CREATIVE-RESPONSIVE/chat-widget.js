(() => {
  const cfg = window.YS_CONFIG || {};
  const ready = !!(window.supabase && cfg.SUPABASE_URL?.startsWith('https://') && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_URL.includes('YOUR_PROJECT'));
  const $ = (s) => document.querySelector(s);
  const launcher = $('#ys-chat-launcher'), panel = $('#ys-chat-panel'), close = $('#ys-chat-close');
  if (!launcher || !panel) return;
  const supa = ready ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  let activeConversation = null, messageChannel = null, currentUser = null, sending = false, processingDraft = false;
  const error = (msg) => { const el = $('#ys-chat-error'); el.textContent = msg; el.style.display = 'block'; };
  const clearError = () => { $('#ys-chat-error').style.display = 'none'; };
  const show = (id) => { ['ys-chat-start','ys-chat-wait','ys-chat-room'].forEach(x => $('#'+x).hidden = x !== id); $('#ys-chat-compose').style.display = id === 'ys-chat-room' ? 'flex' : 'none'; };
  const open = () => { panel.classList.add('open'); launcher.setAttribute('aria-expanded','true'); if (!ready) { show('ys-chat-start'); error('برای فعال‌شدن چت، تنظیمات Supabase هنوز وارد نشده است.'); } else resume(); };
  const shut = () => { panel.classList.remove('open'); launcher.setAttribute('aria-expanded','false'); };
  launcher.addEventListener('click', () => panel.classList.contains('open') ? shut() : open()); close.addEventListener('click', shut);
  $('#ys-chat-start-form').addEventListener('submit', async (e) => {
    e.preventDefault(); clearError(); if (!ready) return error('تنظیمات اتصال هنوز کامل نشده است.');
    const name = $('#ys-client-name').value.trim(), phone = $('#ys-client-phone').value.trim(), email = $('#ys-client-email').value.trim(), message = $('#ys-first-message').value.trim();
    if (!name || !phone || !email || message.length < 3) return error('لطفاً همه فیلدها را کامل کن.');
    if (!$('#ys-consent').checked) return error('برای ثبت اطلاعات تماس، رضایتت را تأیید کن.');
    sessionStorage.setItem('ys_chat_draft', JSON.stringify({name,phone,message}));
    show('ys-chat-wait'); $('#ys-chat-wait-text').textContent = 'در حال ارسال لینک ورود به ایمیل...';
    const { error: authError } = await supa.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split('#')[0], shouldCreateUser: true, data: { full_name: name, phone } } });
    if (authError) { show('ys-chat-start'); return error(authError.message); }
    $('#ys-chat-wait-text').textContent = 'لینک ورود برایت ایمیل شد. ایمیلت را باز کن و روی لینک تأیید بزن؛ سپس همین صفحه به گفت‌وگو تبدیل می‌شود.';
  });
  $('#ys-google-login').addEventListener('click', async () => {
    clearError(); if (!ready) return error('تنظیمات اتصال هنوز کامل نشده است.');
    const name=$('#ys-client-name').value.trim(), phone=$('#ys-client-phone').value.trim(), message=$('#ys-first-message').value.trim();
    if (!name || !phone || message.length < 3 || !$('#ys-consent').checked) return error('قبل از ورود با گوگل، نام، شماره تماس، متن پیشنهاد و رضایت ثبت اطلاعات را کامل کن.');
    sessionStorage.setItem('ys_chat_draft', JSON.stringify({name,phone,message}));
    const { error: e } = await supa.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: location.href.split('#')[0], queryParams:{ access_type:'offline', prompt:'select_account' } } });
    if (e) error(e.message);
  });
  async function resume() {
    const { data:{session} } = await supa.auth.getSession(); currentUser = session?.user || null;
    if (!currentUser) { show('ys-chat-start'); return; }
    const draftRaw = sessionStorage.getItem('ys_chat_draft');
    if (draftRaw) {
      if (processingDraft) return; processingDraft = true;
      const draft = JSON.parse(draftRaw);
      $('#ys-chat-wait-text').textContent = 'در حال ساخت گفت‌وگوی اختصاصی...'; show('ys-chat-wait');
      const { data, error: e } = await supa.rpc('create_ys_conversation', { p_name:draft.name, p_phone:draft.phone, p_initial_message:draft.message });
      if (e) { processingDraft = false; show('ys-chat-start'); return error('ساخت گفت‌وگو انجام نشد: '+e.message); }
      sessionStorage.removeItem('ys_chat_draft'); processingDraft = false; activeConversation = data?.[0]?.conversation_id;
      if (activeConversation) {
        const { data: m } = await supa.from('messages').select('id').eq('conversation_id', activeConversation).order('created_at',{ascending:false}).limit(1).maybeSingle();
        if (m?.id) supa.functions.invoke('telegram-notify',{body:{conversation_id:activeConversation,message_id:m.id}}).catch(()=>{});
      }
    } else {
      const { data, error: e } = await supa.from('conversations').select('id,status,client_name').eq('client_id',currentUser.id).order('updated_at',{ascending:false}).limit(1).maybeSingle();
      if (e || !data) { show('ys-chat-start'); $('#ys-chat-status').textContent='برای شروع گفت‌وگوی جدید، فرم را تکمیل کن.'; return; }
      activeConversation = data.id;
    }
    if (activeConversation) await openRoom();
  }
  async function openRoom() {
    show('ys-chat-room'); $('#ys-chat-compose').style.display='flex'; $('#ys-chat-status').textContent='گفت‌وگوی اختصاصی تو با YS CREATIVE';
    await loadMessages();
    if (messageChannel) supa.removeChannel(messageChannel);
    messageChannel = supa.channel('client-chat-'+activeConversation).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:'conversation_id=eq.'+activeConversation},payload=>appendMessage(payload.new)).subscribe();
  }
  function appendMessage(m) {
    const list=$('#ys-chat-messages'); if (list.querySelector('[data-id="'+m.id+'"]')) return;
    const div=document.createElement('div'); div.className='ys-chat-msg '+(m.sender_role==='admin'?'admin':'client'); div.dataset.id=m.id;
    const body=document.createElement('span'); body.textContent=m.body; const time=document.createElement('time'); time.textContent=new Date(m.created_at).toLocaleString('fa-IR',{hour:'2-digit',minute:'2-digit',month:'short',day:'numeric'}); div.append(body,time); list.append(div); list.scrollTop=list.scrollHeight;
  }
  async function loadMessages(){const {data,error:e}=await supa.from('messages').select('id,body,sender_role,created_at').eq('conversation_id',activeConversation).order('created_at',{ascending:true});if(e)return error(e.message);$('#ys-chat-messages').replaceChildren();(data||[]).forEach(appendMessage);}
  async function sendClientMessage(){if(sending)return;const box=$('#ys-chat-compose-text'),body=box.value.trim();if(!body||!activeConversation)return;sending=true;$('#ys-chat-send').disabled=true;const {error:e}=await supa.from('messages').insert({conversation_id:activeConversation,sender_id:currentUser.id,sender_role:'client',body});if(e)error(e.message);else{box.value='';const {data}=await supa.from('messages').select('id').eq('conversation_id',activeConversation).eq('sender_id',currentUser.id).order('created_at',{ascending:false}).limit(1).maybeSingle();if(data?.id)supa.functions.invoke('telegram-notify',{body:{conversation_id:activeConversation,message_id:data.id}}).catch(()=>{});}sending=false;$('#ys-chat-send').disabled=false;}
  $('#ys-chat-send').addEventListener('click',sendClientMessage);$('#ys-chat-compose-text').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendClientMessage();}});
  supa?.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_IN'&&session){currentUser=session.user;setTimeout(resume,0);}});
})();
