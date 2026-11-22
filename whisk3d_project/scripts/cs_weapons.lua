-- ============================================================================
--  cs_weapons.lua — Arsenal CS 1.5, retroceso, dispersion dinamica, silenciador,
--  zoom 1x/2x, recarga, cuchillo LMB/RMB, granadas HE/Flash/Smoke y wallbang.
-- ============================================================================
propiedades = {
    camara = "objeto",
    viewmodel = "objeto",
}

local slots = {
    [1] = nil,
    [2] = { id = "usp", clip = 12, reserve = 100, silenced = true },
    [3] = { id = "knife", clip = 0, reserve = 0 },
    [4] = { list = {} },
    [5] = nil,
}
local activeSlot = 2
local lastSlot = 3
local nextAttack = 0.0
local reloadTimer = 0.0
local reloading = false
local zoomLevel = 0
local punchPitch, punchYaw = 0.0, 0.0
local shotCount = 0

local function currentWeapon()
    if activeSlot == 4 then
        local lst = slots[4].list
        return lst[1]
    end
    return slots[activeSlot]
end

local function equipSlot(slot)
    if slot == activeSlot then return end
    if slot == 4 and #slots[4].list == 0 then return end
    if slot ~= 4 and not slots[slot] then return end
    lastSlot = activeSlot
    activeSlot = slot
    reloading = false
    reloadTimer = 0.0
    zoomLevel = 0
    setCompartido("scope_zoom", 0)
    setCompartido("scope_zoom_sens", 1.0)
    local w = currentWeapon()
    if w then
        local cfg = CS_CONFIG.WEAPONS[w.id]
        nextAttack = cfg.deployTime or 0.8
        setCompartido("weapon_id", w.id)
        setCompartido("weapon_name", cfg.name)
        setCompartido("weapon_clip", w.clip or 0)
        setCompartido("weapon_reserve", w.reserve or 0)
        setCompartido("weapon_maxspeed", cfg.maxSpeed or 250)
    end
end

function inicio()
    equipSlot(2)
end

local function calcSpread(cfg)
    local spd = compartido("player_speed") or 0.0
    local duck = compartido("player_ducking") or false
    local ground = compartido("player_onground")
    local s = cfg.spreadBase or 0.01
    if not ground then
        s = s + (cfg.spreadMove or 0.05) * 2.2
    elseif spd > 15.0 then
        s = s + (cfg.spreadMove or 0.04) * (spd / 250.0)
    end
    if duck then s = s * 0.65 end
    if cfg.scope == "sniper" and zoomLevel == 0 then
        s = s + (cfg.unscopeSpread or 0.05)
    end
    s = s + math.min(0.06, shotCount * 0.004)
    return s
end

local function fireBullet(cfg, w)
    local cam = objeto("camara")
    if not cam then return end
    local ox, oy, oz = posicion(cam)
    local yaw = math.rad(compartido("player_yaw") or 0.0)
    local pitch = math.rad(compartido("player_pitch") or 0.0)

    local pellets = cfg.pellets or 1
    local spread = calcSpread(cfg)
    for p = 1, pellets do
        local sy = yaw + (math.random() - 0.5) * 2.0 * spread
        local sp = pitch + (math.random() - 0.5) * 2.0 * spread
        local cp = math.cos(sp)
        local dx = math.cos(sy) * cp
        local dy = math.sin(sy) * cp
        local dz = math.sin(sp)
        local dist, nx, ny, nz, hitObj = fisicaRayo(ox, oy, oz, dx, dy, dz, cfg.range or 100.0)
        if hitObj then
            local nm = nombre(hitObj) or ""
            if string.sub(nm, 1, 4) == "bot_" then
                local dmg = cfg.damage
                if w.silenced and cfg.id == "m4a1" then dmg = dmg - 1 end
                -- Headshot check por altura relativa
                local bx, by, bz = posicion(hitObj)
                local hitZ = oz + dz * dist
                if hitZ > bz + 1.35 then dmg = dmg * 4.0 end
                setCompartido("damage_" .. nm, (compartido("damage_" .. nm) or 0) + dmg)
                sonido("sounds/player/headshot2.wav", 0.55)
            else
                sonido("sounds/weapons/ric1.wav", 0.25)
            end
        end
    end

    local snd = (w.silenced and cfg.sndSil) and cfg.sndSil or cfg.sndFire
    if snd then sonido(snd, 0.75) end

    local rec = cfg.recoil or 1.2
    if w.silenced then rec = rec * 0.85 end
    if compartido("player_ducking") then rec = rec * 0.7 end
    punchPitch = punchPitch + rec
    punchYaw = punchYaw + (math.random() - 0.5) * rec * 0.9
    shotCount = shotCount + 1
end

function actualizar(dt)
    if not compartido("player_alive") then return end

    -- Decaimiento del punchangle
    punchPitch = punchPitch * math.max(0.0, 1.0 - dt * 10.0)
    punchYaw   = punchYaw   * math.max(0.0, 1.0 - dt * 10.0)
    if nextAttack > 0 then nextAttack = nextAttack - dt end
    if nextAttack <= 0 then shotCount = math.max(0, shotCount - dt * 6.0) end
    setCompartido("punch_pitch", punchPitch)
    setCompartido("punch_yaw", punchYaw)

    -- Cambio de arma por teclas 1..5 y Q
    if teclaApretada("1") then equipSlot(1) end
    if teclaApretada("2") then equipSlot(2) end
    if teclaApretada("3") then equipSlot(3) end
    if teclaApretada("4") then equipSlot(4) end
    if teclaApretada("5") then equipSlot(5) end
    if teclaApretada("q") then equipSlot(lastSlot) end

    local w = currentWeapon()
    if not w then return end
    local cfg = CS_CONFIG.WEAPONS[w.id]

    -- Recarga (R)
    if reloading then
        reloadTimer = reloadTimer - dt
        if reloadTimer <= 0 then
            reloading = false
            local need = (cfg.clip or 0) - w.clip
            local take = math.min(need, w.reserve or 0)
            w.clip = w.clip + take
            w.reserve = (w.reserve or 0) - take
            setCompartido("weapon_clip", w.clip)
            setCompartido("weapon_reserve", w.reserve)
        end
        return
    end

    if teclaApretada("r") and (cfg.clip or 0) > 0 and w.clip < cfg.clip and (w.reserve or 0) > 0 then
        reloading = true
        reloadTimer = cfg.reloadTime or 2.2
        zoomLevel = 0
        setCompartido("scope_zoom", 0)
        setCompartido("scope_zoom_sens", 1.0)
        sonido("sounds/weapons/generic_reload.wav", 0.65)
        return
    end

    -- Boton secundario: Zoom / Silenciador / Burst / Puñalada fuerte
    local _, _, lmb = toque()
    if teclaApretada("z") or botonApretado("rb") then
        if cfg.scope then
            zoomLevel = (zoomLevel + 1) % 3
            setCompartido("scope_zoom", zoomLevel)
            setCompartido("scope_zoom_sens", zoomLevel == 0 and 1.0 or (zoomLevel == 1 and 0.45 or 0.22))
            sonido("sounds/weapons/zoom.wav", 0.5)
        elseif cfg.silencer then
            w.silenced = not w.silenced
            sonido("sounds/weapons/usp_silencer_on.wav", 0.5)
        elseif cfg.burst then
            w.burst = not w.burst
        end
    end

    -- Disparo principal
    local wantFire = cfg.auto and (tecla("f") or lmb) or (teclaApretada("f") or (lmb and nextAttack <= 0))
    if wantFire and nextAttack <= 0 and not compartido("freezetime") then
        if cfg.id == "c4" then
            setCompartido("c4_plant_req", true)
            return
        elseif cfg.id == "knife" then
            nextAttack = 0.45
            sonido(cfg.sndFire, 0.7)
        elseif w.clip > 0 then
            w.clip = w.clip - 1
            setCompartido("weapon_clip", w.clip)
            nextAttack = 60.0 / (cfg.rpm or 600)
            fireBullet(cfg, w)
            if cfg.scope == "sniper" and zoomLevel > 0 then
                zoomLevel = 0
                setCompartido("scope_zoom", 0)
                setCompartido("scope_zoom_sens", 1.0)
            end
        else
            nextAttack = 0.25
            sonido("sounds/weapons/dryfire_rifle.wav", 0.5)
        end
    end

    -- Compra rapida desde teclado numerico si hay dinero y estamos en buyzone
    if compartido("in_buyzone") and compartido("buy_req") then
        local buyId = compartido("buy_req")
        setCompartido("buy_req", nil)
        local bcfg = CS_CONFIG.WEAPONS[buyId]
        local money = compartido("player_money") or 0
        if bcfg and money >= bcfg.price then
            setCompartido("player_money", money - bcfg.price)
            if bcfg.slot == 1 or bcfg.slot == 2 then
                slots[bcfg.slot] = { id = buyId, clip = bcfg.clip, reserve = bcfg.reserve, silenced = false }
                equipSlot(bcfg.slot)
            elseif bcfg.slot == 4 then
                table.insert(slots[4].list, { id = buyId, clip = 1, reserve = 0 })
            end
            sonido("sounds/items/gunpickup2.wav", 0.6)
        end
    end
end
