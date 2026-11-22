-- ============================================================================
--  cs_config.lua — Tablas oficiales de armas, economia y fisicas de CS 1.5
--  Compatible con Whisk3D Lua 5.4 (ejes Z arriba en script).
-- ============================================================================
CS_CONFIG = {}

-- Constantes de movimiento GoldSrc / CS 1.5 (en unidades metricas Whisk3D: 1m = 39.37 u)
CS_CONFIG.SCALE        = 1.0 / 39.37
CS_CONFIG.GRAVITY      = 800.0 * CS_CONFIG.SCALE    -- ~20.32 m/s^2 (sv_gravity 800)
CS_CONFIG.ACCELERATE   = 5.0                        -- sv_accelerate 5 (CS 1.5)
CS_CONFIG.AIR_ACCEL    = 10.0                       -- sv_airaccelerate 10
CS_CONFIG.AIR_WISH_CAP = 30.0 * CS_CONFIG.SCALE     -- 30 u/s cap -> air-strafing & bhop!
CS_CONFIG.FRICTION     = 4.0                        -- sv_friction 4
CS_CONFIG.STOPSPEED    = 75.0 * CS_CONFIG.SCALE     -- sv_stopspeed 75
CS_CONFIG.JUMP_VEL     = 268.328 * CS_CONFIG.SCALE  -- sqrt(2 * 800 * 45)
CS_CONFIG.STEP_SIZE    = 18.0 * CS_CONFIG.SCALE     -- sv_stepsize 18
CS_CONFIG.EYE_STAND    = 1.625                      -- +64 u desde los pies
CS_CONFIG.EYE_DUCK     = 0.762                      -- +30 u desde los pies
CS_CONFIG.HEIGHT_STAND = 1.829                      -- 72 u
CS_CONFIG.HEIGHT_DUCK  = 0.914                      -- 36 u

-- Economia CS 1.5
CS_CONFIG.START_MONEY  = 800
CS_CONFIG.MAX_MONEY    = 16000
CS_CONFIG.KILL_REWARD  = 300
CS_CONFIG.WIN_REWARD   = 3250
CS_CONFIG.BOMB_WIN_T   = 3500
CS_CONFIG.PLANT_BONUS  = 300
CS_CONFIG.DEFUSE_BONUS = 300
CS_CONFIG.LOSS_BASE    = 1400
CS_CONFIG.LOSS_STEP    = 500
CS_CONFIG.LOSS_MAX     = 2900

-- Arsenal completo de Counter-Strike 1.5 (cs15_retail)
CS_CONFIG.WEAPONS = {
    knife = {
        id="knife", name="Knife", slot=3, team="both", price=0,
        damage=15, altDamage=65, armorPen=0.85, range=1.65,
        rpm=150, clip=0, reserve=0, maxSpeed=250, spreadBase=0.0,
        recoil=0.0, reloadTime=0.0, deployTime=0.75,
        vmodel="models/v_knife.glb", sndFire="sounds/weapons/knife_slash1.wav"
    },
    glock18 = {
        id="glock18", name="9x19mm Sidearm (Glock18)", slot=2, team="both", price=400,
        damage=25, armorPen=0.47, range=104, rpm=400, auto=false, burst=true,
        clip=20, reserve=120, maxSpeed=250, spreadBase=0.015, spreadMove=0.04,
        recoil=1.1, reloadTime=2.2, deployTime=1.0,
        vmodel="models/v_glock18.glb", sndFire="sounds/weapons/glock18-1.wav"
    },
    usp = {
        id="usp", name="KM .45 Tactical (USP)", slot=2, team="both", price=500,
        damage=34, armorPen=0.505, range=104, rpm=352, auto=false, silencer=true,
        clip=12, reserve=100, maxSpeed=250, spreadBase=0.012, spreadMove=0.035,
        recoil=1.35, reloadTime=2.7, deployTime=1.0,
        vmodel="models/v_usp.glb", sndFire="sounds/weapons/usp_unsil-1.wav", sndSil="sounds/weapons/usp1.wav"
    },
    p228 = {
        id="p228", name="228 Compact", slot=2, team="both", price=600,
        damage=32, armorPen=0.625, range=104, rpm=352, auto=false,
        clip=13, reserve=52, maxSpeed=250, spreadBase=0.014, spreadMove=0.038,
        recoil=1.4, reloadTime=2.7, deployTime=1.0,
        vmodel="models/v_p228.glb", sndFire="sounds/weapons/p228-1.wav"
    },
    deagle = {
        id="deagle", name="Night Hawk .50C (Deagle)", slot=2, team="both", price=650,
        damage=54, armorPen=0.932, range=104, rpm=266, auto=false, penetration=2,
        clip=7, reserve=35, maxSpeed=250, spreadBase=0.016, spreadMove=0.065,
        recoil=3.4, reloadTime=2.2, deployTime=1.0,
        vmodel="models/v_deagle.glb", sndFire="sounds/weapons/deagle-1.wav"
    },
    fiveseven = {
        id="fiveseven", name="ES Five-Seven", slot=2, team="CT", price=750,
        damage=25, armorPen=0.911, range=104, rpm=400, auto=false,
        clip=20, reserve=100, maxSpeed=250, spreadBase=0.013, spreadMove=0.036,
        recoil=1.2, reloadTime=3.0, deployTime=1.0,
        vmodel="models/v_fiveseven.glb", sndFire="sounds/weapons/fiveseven-1.wav"
    },
    elite = {
        id="elite", name=".40 Dual Elites", slot=2, team="T", price=1000,
        damage=36, armorPen=0.525, range=104, rpm=500, auto=false,
        clip=30, reserve=120, maxSpeed=250, spreadBase=0.018, spreadMove=0.045,
        recoil=1.5, reloadTime=4.6, deployTime=1.1,
        vmodel="models/v_elite.glb", sndFire="sounds/weapons/elite_fire.wav"
    },
    m3 = {
        id="m3", name="Leone 12 Gauge Super (M3)", slot=1, team="both", price=1700,
        damage=20, pellets=9, armorPen=0.5, range=45, rpm=68, auto=false,
        clip=8, reserve=32, maxSpeed=230, spreadBase=0.065, spreadMove=0.08,
        recoil=4.2, reloadTime=0.55, deployTime=1.0,
        vmodel="models/v_m3.glb", sndFire="sounds/weapons/m3-1.wav"
    },
    xm1014 = {
        id="xm1014", name="Leone YG1265 Auto (XM1014)", slot=1, team="both", price=3000,
        damage=18, pellets=6, armorPen=0.6, range=45, rpm=240, auto=true,
        clip=7, reserve=32, maxSpeed=240, spreadBase=0.068, spreadMove=0.085,
        recoil=3.0, reloadTime=0.5, deployTime=1.0,
        vmodel="models/v_xm1014.glb", sndFire="sounds/weapons/xm1014-1.wav"
    },
    mac10 = {
        id="mac10", name="Ingram MAC-10", slot=1, team="T", price=1400,
        damage=29, armorPen=0.475, range=80, rpm=857, auto=true,
        clip=30, reserve=100, maxSpeed=250, spreadBase=0.025, spreadMove=0.035,
        recoil=1.05, reloadTime=3.15, deployTime=1.0,
        vmodel="models/v_mac10.glb", sndFire="sounds/weapons/mac10-1.wav"
    },
    tmp = {
        id="tmp", name="Schmidt Machine Pistol (TMP)", slot=1, team="CT", price=1250,
        damage=26, armorPen=0.5, range=80, rpm=857, auto=true, suppressedAlways=true,
        clip=30, reserve=120, maxSpeed=250, spreadBase=0.022, spreadMove=0.032,
        recoil=0.85, reloadTime=2.12, deployTime=1.0,
        vmodel="models/v_tmp.glb", sndFire="sounds/weapons/tmp-1.wav"
    },
    mp5 = {
        id="mp5", name="K&M Sub-Machine Gun (MP5)", slot=1, team="both", price=1500,
        damage=26, armorPen=0.5, range=104, rpm=750, auto=true,
        clip=30, reserve=120, maxSpeed=250, spreadBase=0.017, spreadMove=0.028,
        recoil=0.95, reloadTime=2.63, deployTime=1.0,
        vmodel="models/v_mp5.glb", sndFire="sounds/weapons/mp5-1.wav"
    },
    ump45 = {
        id="ump45", name="K&M UMP45", slot=1, team="both", price=1700,
        damage=30, armorPen=0.5, range=104, rpm=560, auto=true,
        clip=25, reserve=100, maxSpeed=250, spreadBase=0.019, spreadMove=0.032,
        recoil=1.25, reloadTime=3.5, deployTime=1.0,
        vmodel="models/v_ump45.glb", sndFire="sounds/weapons/ump45-1.wav"
    },
    p90 = {
        id="p90", name="ES C90 (P90)", slot=1, team="both", price=2350,
        damage=21, armorPen=0.75, range=104, rpm=857, auto=true,
        clip=50, reserve=100, maxSpeed=245, spreadBase=0.022, spreadMove=0.03,
        recoil=0.9, reloadTime=3.4, deployTime=1.0,
        vmodel="models/v_p90.glb", sndFire="sounds/weapons/p90-1.wav"
    },
    ak47 = {
        id="ak47", name="CV-47 (AK-47)", slot=1, team="T", price=2500,
        damage=36, armorPen=0.775, range=208, rpm=600, auto=true, penetration=2,
        clip=30, reserve=90, maxSpeed=221, spreadBase=0.008, spreadMove=0.075,
        recoil=2.15, reloadTime=2.45, deployTime=1.0,
        vmodel="models/v_ak47.glb", sndFire="sounds/weapons/ak47-1.wav"
    },
    m4a1 = {
        id="m4a1", name="Maverick M4A1 Carbine", slot=1, team="CT", price=3100,
        damage=33, armorPen=0.70, range=208, rpm=666, auto=true, silencer=true, penetration=2,
        clip=30, reserve=90, maxSpeed=230, spreadBase=0.007, spreadMove=0.065,
        recoil=1.8, reloadTime=3.05, deployTime=1.0,
        vmodel="models/v_m4a1.glb", sndFire="sounds/weapons/m4a1_unsil-1.wav", sndSil="sounds/weapons/m4a1-1.wav"
    },
    sg552 = {
        id="sg552", name="Krieg 552 Commando", slot=1, team="T", price=3500,
        damage=33, armorPen=0.70, range=208, rpm=666, auto=true, scope="aug", penetration=2,
        clip=30, reserve=90, maxSpeed=235, spreadBase=0.007, spreadMove=0.065,
        recoil=1.85, reloadTime=2.8, deployTime=1.0,
        vmodel="models/v_sg552.glb", sndFire="sounds/weapons/sg552-1.wav"
    },
    aug = {
        id="aug", name="Bullpup (Steyr AUG)", slot=1, team="CT", price=3500,
        damage=32, armorPen=0.70, range=208, rpm=666, auto=true, scope="aug", penetration=2,
        clip=30, reserve=90, maxSpeed=240, spreadBase=0.007, spreadMove=0.062,
        recoil=1.75, reloadTime=3.3, deployTime=1.0,
        vmodel="models/v_aug.glb", sndFire="sounds/weapons/aug-1.wav"
    },
    scout = {
        id="scout", name="Schmidt Scout", slot=1, team="both", price=2750,
        damage=75, armorPen=0.85, range=208, rpm=48, auto=false, scope="sniper", penetration=2,
        clip=10, reserve=90, maxSpeed=260, spreadBase=0.001, spreadMove=0.04, unscopeSpread=0.035,
        recoil=2.2, reloadTime=2.0, deployTime=1.0,
        vmodel="models/v_scout.glb", sndFire="sounds/weapons/scout_fire-1.wav"
    },
    awp = {
        id="awp", name="Magnum Sniper Rifle (AWP)", slot=1, team="both", price=4750,
        damage=115, armorPen=0.975, range=208, rpm=41, auto=false, scope="sniper", penetration=3,
        clip=10, reserve=30, maxSpeed=210, spreadBase=0.0005, spreadMove=0.12, unscopeSpread=0.065,
        recoil=5.5, reloadTime=2.5, deployTime=1.2,
        vmodel="models/v_awp.glb", sndFire="sounds/weapons/awp1.wav"
    },
    g3sg1 = {
        id="g3sg1", name="D3/AU-1 (G3/SG-1)", slot=1, team="T", price=5000,
        damage=80, armorPen=0.825, range=208, rpm=240, auto=true, scope="sniper", penetration=2,
        clip=20, reserve=90, maxSpeed=210, spreadBase=0.002, spreadMove=0.09, unscopeSpread=0.045,
        recoil=2.6, reloadTime=4.7, deployTime=1.1,
        vmodel="models/v_g3sg1.glb", sndFire="sounds/weapons/g3sg1-1.wav"
    },
    sg550 = {
        id="sg550", name="Krieg 550 Commando", slot=1, team="CT", price=4200,
        damage=70, armorPen=0.725, range=208, rpm=240, auto=true, scope="sniper", penetration=2,
        clip=30, reserve=90, maxSpeed=210, spreadBase=0.002, spreadMove=0.08, unscopeSpread=0.04,
        recoil=2.2, reloadTime=3.8, deployTime=1.1,
        vmodel="models/v_sg550.glb", sndFire="sounds/weapons/sg550-1.wav"
    },
    m249 = {
        id="m249", name="ES M249 Para", slot=1, team="both", price=5750,
        damage=32, armorPen=0.80, range=208, rpm=600, auto=true, penetration=2,
        clip=100, reserve=200, maxSpeed=220, spreadBase=0.014, spreadMove=0.085,
        recoil=2.0, reloadTime=4.7, deployTime=1.1,
        vmodel="models/v_m249.glb", sndFire="sounds/weapons/m249-1.wav"
    },
    hegrenade = {
        id="hegrenade", name="HE Grenade", slot=4, team="both", price=300,
        maxSpeed=250, vmodel="models/v_hegrenade.glb"
    },
    flashbang = {
        id="flashbang", name="Flashbang", slot=4, team="both", price=200,
        maxSpeed=250, vmodel="models/v_flashbang.glb"
    },
    smokegrenade = {
        id="smokegrenade", name="Smoke Grenade", slot=4, team="both", price=300,
        maxSpeed=250, vmodel="models/v_smokegrenade.glb"
    },
    c4 = {
        id="c4", name="C4 Explosive", slot=5, team="T", price=0,
        maxSpeed=250, vmodel="models/v_c4.glb"
    }
}
