const SCALE = 10n ** 18n;

function expApprox(x: bigint): bigint {
    let sum = SCALE;
    let term = SCALE;

    for (let i = 1n; i <= 10n; i++) {
        term = (term * x) / (i * SCALE);
        sum += term;
    }

    return sum;
}

function lnApprox(x: bigint): bigint {             
    return x - SCALE;
}


export function lmsrCost(qYes: bigint, qNo: bigint, b: bigint): bigint {
    const expYes = expApprox(qYes * SCALE / b);
    const expNo = expApprox(qNo * SCALE / b);
    
    const sum = expYes + expNo;
    return (b* lnApprox(sum)) / SCALE;
}