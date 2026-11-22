// ============================================================================
//  weapons.js — Arsenal completo Counter-Strike 1.5 Retail (27 armas/items)
// ============================================================================
export const WEAPONS = {
    // --- Slot 3: Melee ---
    knife:       { id:"knife",       name:"Knife",                slot:3, price:0,    team:"BOTH", dmg:18,  headMult:2.0, rate:0.42, auto:true,  clip:0,   res:0,   reload:0,   spd:250, spread:0.002, recoil:0.4, pen:0, melee:true,  vm:"models/v_knife.glb",        snd:"sounds/weapons/knife_slash1.wav" },
    // --- Slot 2: Pistols ---
    glock18:     { id:"glock18",     name:"9x19mm Sidearm",       slot:2, price:400,  team:"BOTH", dmg:25,  headMult:3.6, rate:0.15, auto:false, clip:20,  res:120, reload:2.2, spd:250, spread:0.014, recoil:1.4, pen:1, burstCap:true, vm:"models/v_glock18.glb",    snd:"sounds/weapons/glock18-1.wav", relSnd:"sounds/weapons/clipin1.wav" },
    usp:         { id:"usp",         name:"K&M .45 Tactical",     slot:2, price:500,  team:"BOTH", dmg:34,  headMult:3.8, rate:0.16, auto:false, clip:12,  res:100, reload:2.7, spd:250, spread:0.011, recoil:1.6, pen:1, silCap:true,  vm:"models/v_usp.glb",        snd:"sounds/weapons/usp_unsil-1.wav", silSnd:"sounds/weapons/usp1.wav", relSnd:"sounds/weapons/usp_clipin.wav" },
    p228:        { id:"p228",        name:"228 Compact",          slot:2, price:600,  team:"BOTH", dmg:32,  headMult:3.7, rate:0.15, auto:false, clip:13,  res:52,  reload:2.7, spd:250, spread:0.013, recoil:1.6, pen:1, vm:"models/v_p228.glb",       snd:"sounds/weapons/p228-1.wav", relSnd:"sounds/weapons/p228_clipin.wav" },
    deagle:      { id:"deagle",      name:"Night Hawk .50C",      slot:2, price:650,  team:"BOTH", dmg:54,  headMult:4.0, rate:0.25, auto:false, clip:7,   res:35,  reload:2.2, spd:250, spread:0.010, recoil:3.8, pen:2, vm:"models/v_deagle.glb",     snd:"sounds/weapons/deagle-1.wav", relSnd:"sounds/weapons/de_clipin.wav" },
    fiveseven:   { id:"fiveseven",   name:"ES Five-Seven",        slot:2, price:750,  team:"CT",   dmg:25,  headMult:3.6, rate:0.14, auto:false, clip:20,  res:100, reload:2.6, spd:250, spread:0.012, recoil:1.3, pen:1, vm:"models/v_fiveseven.glb",  snd:"sounds/weapons/fiveseven-1.wav", relSnd:"sounds/weapons/fiveseven_clipin.wav" },
    elite:       { id:"elite",       name:".40 Dual Elites",      slot:2, price:1000, team:"T",    dmg:36,  headMult:3.6, rate:0.12, auto:false, clip:30,  res:120, reload:4.5, spd:250, spread:0.016, recoil:1.7, pen:1, vm:"models/v_elite.glb",      snd:"sounds/weapons/elite_fire.wav", relSnd:"sounds/weapons/elite_leftclipin.wav" },
    // --- Slot 1: Shotguns ---
    m3:          { id:"m3",          name:"Leone 12 Gauge Super", slot:1, price:1700, team:"BOTH", dmg:20,  headMult:2.5, rate:0.88, auto:false, clip:8,   res:32,  reload:2.6, spd:230, spread:0.068, recoil:4.6, pen:1, pellets:9, vm:"models/v_m3.glb",         snd:"sounds/weapons/m3-1.wav", relSnd:"sounds/weapons/m3_insertshell.wav" },
    xm1014:      { id:"xm1014",      name:"Leone YG1265 Auto",    slot:1, price:3000, team:"BOTH", dmg:18,  headMult:2.5, rate:0.25, auto:true,  clip:7,   res:32,  reload:2.8, spd:240, spread:0.072, recoil:3.5, pen:1, pellets:6, vm:"models/v_xm1014.glb",     snd:"sounds/weapons/xm1014-1.wav", relSnd:"sounds/weapons/m3_insertshell.wav" },
    // --- Slot 1: SMGs ---
    mac10:       { id:"mac10",       name:"Ingram MAC-10",        slot:1, price:1400, team:"T",    dmg:29,  headMult:3.2, rate:0.075,auto:true,  clip:30,  res:100, reload:3.1, spd:250, spread:0.028, recoil:1.3, pen:1, vm:"models/v_mac10.glb",      snd:"sounds/weapons/mac10-1.wav", relSnd:"sounds/weapons/mac10_clipin.wav" },
    tmp:         { id:"tmp",         name:"Schmidt Machine Pistol",slot:1,price:1250, team:"CT",   dmg:26,  headMult:3.2, rate:0.075,auto:true,  clip:30,  res:120, reload:2.1, spd:250, spread:0.024, recoil:1.1, pen:1, silenced:true, vm:"models/v_tmp.glb",  snd:"sounds/weapons/tmp-1.wav", relSnd:"sounds/weapons/clipin1.wav" },
    mp5:         { id:"mp5",         name:"K&M Sub-Machine Gun",  slot:1, price:1500, team:"BOTH", dmg:26,  headMult:3.3, rate:0.080,auto:true,  clip:30,  res:120, reload:2.6, spd:250, spread:0.017, recoil:1.2, pen:1, vm:"models/v_mp5.glb",        snd:"sounds/weapons/mp5-1.wav", relSnd:"sounds/weapons/mp5_clipin.wav" },
    ump45:       { id:"ump45",       name:"K&M UMP45",            slot:1, price:1700, team:"BOTH", dmg:30,  headMult:3.3, rate:0.105,auto:true,  clip:25,  res:100, reload:3.5, spd:250, spread:0.018, recoil:1.5, pen:1, vm:"models/v_ump45.glb",      snd:"sounds/weapons/ump45-1.wav", relSnd:"sounds/weapons/ump45_clipin.wav" },
    p90:         { id:"p90",         name:"ES C90",               slot:1, price:2350, team:"BOTH", dmg:21,  headMult:3.2, rate:0.068,auto:true,  clip:50,  res:100, reload:3.4, spd:245, spread:0.020, recoil:1.1, pen:1, vm:"models/v_p90.glb",        snd:"sounds/weapons/p90-1.wav", relSnd:"sounds/weapons/p90_clipin.wav" },
    // --- Slot 1: Rifles ---
    ak47:        { id:"ak47",        name:"CV-47",                slot:1, price:2500, team:"T",    dmg:36,  headMult:4.0, rate:0.100,auto:true,  clip:30,  res:90,  reload:2.5, spd:221, spread:0.011, recoil:2.6, pen:2, vm:"models/v_ak47.glb",       snd:"sounds/weapons/ak47-1.wav", relSnd:"sounds/weapons/ak47_clipin.wav" },
    m4a1:        { id:"m4a1",        name:"Maverick M4A1 Carbine",slot:1, price:3100, team:"CT",   dmg:33,  headMult:4.0, rate:0.090,auto:true,  clip:30,  res:90,  reload:3.1, spd:230, spread:0.009, recoil:2.0, pen:2, silCap:true, vm:"models/v_m4a1.glb", snd:"sounds/weapons/m4a1_unsil-1.wav", silSnd:"sounds/weapons/m4a1-1.wav", relSnd:"sounds/weapons/m4a1_clipin.wav" },
    sg552:       { id:"sg552",       name:"Krieg 552 Commando",   slot:1, price:3500, team:"T",    dmg:33,  headMult:4.0, rate:0.092,auto:true,  clip:30,  res:90,  reload:2.8, spd:235, spread:0.009, recoil:2.1, pen:2, zoomFov:[55], vm:"models/v_sg552.glb", snd:"sounds/weapons/sg552-1.wav", relSnd:"sounds/weapons/sg552_clipin.wav" },
    aug:         { id:"aug",         name:"Bullpup",              slot:1, price:3500, team:"CT",   dmg:32,  headMult:4.0, rate:0.092,auto:true,  clip:30,  res:90,  reload:3.3, spd:240, spread:0.009, recoil:2.0, pen:2, zoomFov:[55], vm:"models/v_aug.glb",   snd:"sounds/weapons/aug-1.wav", relSnd:"sounds/weapons/aug_clipin.wav" },
    scout:       { id:"scout",       name:"Schmidt Scout",        slot:1, price:2750, team:"BOTH", dmg:75,  headMult:4.0, rate:1.25, auto:false, clip:10,  res:90,  reload:2.0, spd:260, spread:0.0012,recoil:3.2, pen:3, zoomFov:[40,15], sniper:true, vm:"models/v_scout.glb",  snd:"sounds/weapons/scout_fire-1.wav", relSnd:"sounds/weapons/scout_clipin.wav" },
    awp:         { id:"awp",         name:"Magnum Sniper Rifle",  slot:1, price:4750, team:"BOTH", dmg:115, headMult:4.0, rate:1.45, auto:false, clip:10,  res:30,  reload:2.9, spd:210, spread:0.0005,recoil:6.2, pen:3, zoomFov:[40,10], sniper:true, vm:"models/v_awp.glb",    snd:"sounds/weapons/awp1.wav", relSnd:"sounds/weapons/awp_clipin.wav" },
    g3sg1:       { id:"g3sg1",       name:"D3/AU-1",              slot:1, price:5000, team:"T",    dmg:80,  headMult:3.6, rate:0.25, auto:true,  clip:20,  res:90,  reload:4.7, spd:210, spread:0.0025,recoil:3.6, pen:3, zoomFov:[40,15], sniper:true, vm:"models/v_g3sg1.glb",  snd:"sounds/weapons/g3sg1-1.wav", relSnd:"sounds/weapons/g3sg1_clipin.wav" },
    sg550:       { id:"sg550",       name:"Krieg 550 Commando",   slot:1, price:4200, team:"CT",   dmg:70,  headMult:3.6, rate:0.25, auto:true,  clip:30,  res:90,  reload:3.8, spd:210, spread:0.0025,recoil:3.1, pen:3, zoomFov:[40,15], sniper:true, vm:"models/v_sg550.glb",  snd:"sounds/weapons/sg550-1.wav", relSnd:"sounds/weapons/sg550_clipin.wav" },
    // --- Slot 1: Heavy ---
    m249:        { id:"m249",        name:"ES M249 Para",         slot:1, price:5750, team:"BOTH", dmg:32,  headMult:3.8, rate:0.098,auto:true,  clip:100, res:200, reload:4.7, spd:220, spread:0.017, recoil:2.3, pen:2, vm:"models/v_m249.glb",       snd:"sounds/weapons/m249-1.wav", relSnd:"sounds/weapons/m249_boxin.wav" },
    // --- Slot 4: Grenades ---
    hegrenade:   { id:"hegrenade",   name:"HE Grenade",           slot:4, price:300,  team:"BOTH", dmg:98,  rate:1.0,  spd:250, grenade:"he",    vm:"models/v_hegrenade.glb",    snd:"sounds/weapons/pinpull.wav" },
    flashbang:   { id:"flashbang",   name:"Flashbang",            slot:4, price:200,  team:"BOTH", dmg:0,   rate:1.0,  spd:250, grenade:"flash", vm:"models/v_flashbang.glb",    snd:"sounds/weapons/pinpull.wav" },
    smokegrenade:{ id:"smokegrenade",name:"Smoke Grenade",        slot:4, price:300,  team:"BOTH", dmg:0,   rate:1.0,  spd:250, grenade:"smoke", vm:"models/v_smokegrenade.glb", snd:"sounds/weapons/pinpull.wav" },
    // --- Slot 5: C4 ---
    c4:          { id:"c4",          name:"C4 Explosive",         slot:5, price:0,    team:"T",    dmg:500, rate:1.0,  spd:250, isC4:true, vm:"models/v_c4.glb",           snd:"sounds/weapons/c4_click.wav" },
};

export const BUY_MENU = {
    0: { title: "BUY MENU", items: [
        { key:"1", label:"1. Handguns",          sub:1 },
        { key:"2", label:"2. Shotguns",          sub:2 },
        { key:"3", label:"3. Sub-Machine Guns",  sub:3 },
        { key:"4", label:"4. Rifles",            sub:4 },
        { key:"5", label:"5. Machine Guns",      sub:5 },
        { key:"6", label:"6. Primary Ammo",      action:"ammo1", price:60 },
        { key:"7", label:"7. Secondary Ammo",    action:"ammo2", price:40 },
        { key:"8", label:"8. Equipment",         sub:8 },
    ]},
    1: { title: "HANDGUNS", items: [
        { key:"1", id:"glock18" },
        { key:"2", id:"usp" },
        { key:"3", id:"p228" },
        { key:"4", id:"deagle" },
        { key:"5", id:"elite",     team:"T" },
        { key:"5", id:"fiveseven", team:"CT" },
    ]},
    2: { title: "SHOTGUNS", items: [
        { key:"1", id:"m3" },
        { key:"2", id:"xm1014" },
    ]},
    3: { title: "SUB-MACHINE GUNS", items: [
        { key:"1", id:"mac10", team:"T" },
        { key:"1", id:"tmp",   team:"CT" },
        { key:"2", id:"mp5" },
        { key:"3", id:"ump45" },
        { key:"4", id:"p90" },
    ]},
    4: { title: "RIFLES", items: [
        { key:"1", id:"ak47",  team:"T" },
        { key:"1", id:"scout", team:"CT" },
        { key:"2", id:"scout", team:"T" },
        { key:"2", id:"m4a1",  team:"CT" },
        { key:"3", id:"sg552", team:"T" },
        { key:"3", id:"aug",   team:"CT" },
        { key:"4", id:"awp" },
        { key:"5", id:"g3sg1", team:"T" },
        { key:"5", id:"sg550", team:"CT" },
    ]},
    5: { title: "MACHINE GUNS", items: [
        { key:"1", id:"m249" },
    ]},
    8: { title: "EQUIPMENT", items: [
        { key:"1", label:"Kevlar Vest",          action:"kevlar",        price:650 },
        { key:"2", label:"Kevlar + Helmet",      action:"kevlar_helmet", price:1000 },
        { key:"3", id:"flashbang" },
        { key:"4", id:"hegrenade" },
        { key:"5", id:"smokegrenade" },
        { key:"6", label:"Defusal Kit",          action:"defuser",       price:200, team:"CT" },
        { key:"7", label:"Nightvision Goggles",  action:"nvg",           price:1250 },
    ]},
};

export function createWeaponInstance(id) {
    const def = WEAPONS[id];
    return {
        id,
        def,
        clip: def.clip || 0,
        reserve: def.res || 0,
        silenced: false,
        burst: false,
    };
}
