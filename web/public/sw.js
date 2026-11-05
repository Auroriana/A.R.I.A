self.addEventListener('push',event=>{
 let data;try{data=event.data.json();}catch{return;}
 event.waitUntil(self.registration.showNotification('Capri',{body:data.body,tag:data.id,icon:'/capri-avatar.avif',data:{chat:data.id},requireInteraction:true}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const id=event.notification.data?.chat;
 if(!/^[0-9a-f-]{36}$/i.test(id||''))return;
 event.waitUntil(clients.openWindow('/?chat='+encodeURIComponent(id)));
});
