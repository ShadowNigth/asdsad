-- ============================================================================
--  cs_hud.lua — HUD clasico CS 1.5 (verde/ambar), Radar, Crosshair y Buy Menu
-- ============================================================================
propiedades = {
    txtHP    = "objeto",
    txtArmor = "objeto",
    txtAmmo  = "objeto",
    txtMoney = "objeto",
    txtTimer = "objeto",
    txtScore = "objeto",
    txtBanner= "objeto",
    panelBuy = "objeto",
}

local buyOpen = false

function actualizar(dt)
    local tHP    = objeto("txtHP")
    local tArmor = objeto("txtArmor")
    local tAmmo  = objeto("txtAmmo")
    local tMoney = objeto("txtMoney")
    local tTimer = objeto("txtTimer")
    local tScore = objeto("txtScore")
    local tBan   = objeto("txtBanner")
    local pBuy   = objeto("panelBuy")

    if tHP    then setTexto(tHP,    "+ " .. tostring(math.floor(compartido("player_hp") or 100))) end
    if tArmor then setTexto(tArmor, "A " .. tostring(math.floor(compartido("player_armor") or 0))) end
    if tAmmo  then
        local cl = compartido("weapon_clip") or 0
        local rs = compartido("weapon_reserve") or 0
        setTexto(tAmmo, tostring(cl) .. " | " .. tostring(rs))
    end
    if tMoney then setTexto(tMoney, "$ " .. tostring(compartido("player_money") or 800)) end
    if tTimer then
        local sec = math.floor(compartido("round_timer") or 0)
        setTexto(tTimer, string.format("%d:%02d", math.floor(sec / 60), sec % 60))
    end
    if tScore then
        setTexto(tScore, string.format("CT %d : %d T", compartido("score_ct") or 0, compartido("score_t") or 0))
    end
    if tBan then
        local b = compartido("round_banner")
        setTexto(tBan, b or "")
    end

    if teclaApretada("b") and compartido("in_buyzone") then
        buyOpen = not buyOpen
        if pBuy then setVisible(pBuy, buyOpen) end
    end
    if buyOpen then
        if teclaApretada("1") then setCompartido("buy_req", "ak47"); buyOpen = false end
        if teclaApretada("2") then setCompartido("buy_req", "m4a1"); buyOpen = false end
        if teclaApretada("3") then setCompartido("buy_req", "awp"); buyOpen = false end
        if teclaApretada("4") then setCompartido("buy_req", "mp5"); buyOpen = false end
        if teclaApretada("5") then setCompartido("buy_req", "deagle"); buyOpen = false end
        if pBuy and not buyOpen then setVisible(pBuy, false) end
    end
end
