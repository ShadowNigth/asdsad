-- ============================================================================
--  cs_bots.lua — IA Tactica de Bots CT y Terroristas para modos de_*
-- ============================================================================
propiedades = {
    equipo = { "CT", "T" },
    objetivoA = "objeto",
    objetivoB = "objeto",
    jugador = "objeto",
}

local hp = 100
local alive = true
local spawnPos = {0, 0, 0}
local fireCooldown = 0.0
local strafeDir = 1
local strafeTimer = 1.5

function inicio()
    local x, y, z = posicion(yo())
    spawnPos = {x, y, z}
    hp = 100
    alive = true
end

function actualizar(dt)
    if compartido("reset_round") then
        hp = 100
        alive = true
        setVisible(yo(), true)
        setPosicion(yo(), spawnPos[1], spawnPos[2], spawnPos[3])
        return
    end
    if not alive then return end

    local nm = nombre(yo())
    local incoming = compartido("damage_" .. nm) or 0
    if incoming > 0 then
        setCompartido("damage_" .. nm, 0)
        hp = hp - incoming
        if hp <= 0 then
            alive = false
            setVisible(yo(), false)
            sonido("sounds/player/die1.wav", 0.7)
            setCompartido("player_money", math.min(CS_CONFIG.MAX_MONEY, (compartido("player_money") or 0) + CS_CONFIG.KILL_REWARD))
            return
        end
    end

    if compartido("freezetime") then return end

    local me = yo()
    local mx, my, mz = posicion(me)
    local target = objeto("objetivoA")
    local jug = objeto("jugador")
    if jug and compartido("player_alive") and opcion("equipo") ~= (compartido("player_team") or "CT") then
        local jx, jy, jz = posicion(jug)
        local d = math.sqrt((jx-mx)^2 + (jy-my)^2 + (jz-mz)^2)
        if d < 28.0 then
            target = jug
            fireCooldown = fireCooldown - dt
            if fireCooldown <= 0 and d < 22.0 then
                fireCooldown = 0.35 + math.random() * 0.35
                local _, _, _, _, hitObj = fisicaRayo(mx, my, mz + 1.5, (jx-mx)/d, (jy-my)/d, (jz-mz)/d, d + 0.5)
                if hitObj == jug then
                    sonido("sounds/weapons/ak47-1.wav", 0.5)
                    local php = (compartido("player_hp") or 100) - math.random(8, 18)
                    setCompartido("player_hp", math.max(0, php))
                    if php <= 0 then setCompartido("player_alive", false) end
                end
            end
        end
    end

    if target then
        local tx, ty, tz = posicion(target)
        local dx, dy = tx - mx, ty - my
        local dist = math.sqrt(dx*dx + dy*dy)
        if dist > 2.2 then
            local spd = 4.8 * dt
            strafeTimer = strafeTimer - dt
            if strafeTimer <= 0 then strafeDir = -strafeDir; strafeTimer = 1.2 + math.random() end
            local nx = (dx / dist) * spd
            local ny = (dy / dist) * spd
            mover(me, nx, ny, 0)
            mirarA(me, tx, ty, mz)
        end
    end
end
