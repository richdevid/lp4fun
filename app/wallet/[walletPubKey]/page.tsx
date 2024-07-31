// app/wallet/[walletPubKey]/page.tsx
'use client';

import {usePathname, useSearchParams} from 'next/navigation';
import React, {useEffect, useState} from 'react';
import TableComponent from '@/app/wallet/[walletPubKey]/TableComponent';
import DLMM, {LbPosition} from '@meteora-ag/dlmm';
import {Connection, PublicKey} from '@solana/web3.js';
import {formatTokenBalance} from "@/app/utils/solana";
import {PoolData, PositionData} from "@/app/types";
import {bnToDate} from "@/app/utils/numberFormatting";
import {fetchWithRetry} from "@/app/utils/rateLimitedFetch";
import {fetchTokenPrice} from "@/app/utils/jup";
import {config} from "@/app/utils/config";

const createDataMap = async (wallet: string): Promise<Map<string, PoolData>> => {
    const connection = new Connection(config.RPC_ENDPOINT);
    const user = new PublicKey(wallet);
    const positions = await fetchWithRetry(() => DLMM.getAllLbPairPositionsByUser(connection, user));
    const map = new Map<string, PoolData>();

    await Promise.all(Array.from(positions.entries()).map(async ([key, position]) => {
        const tokenInfo = await fetchTokenPrice(position.tokenX.publicKey, position.tokenY.publicKey);

        const lbPairPositionsData = position.lbPairPositionsData.map((pos: LbPosition): PositionData => {
            const claimedFeeXAmount = pos.positionData.totalClaimedFeeXAmount.toString();
            const claimedFeeYAmount = pos.positionData.totalClaimedFeeYAmount.toString();

            return {
                lastUpdatedAt: bnToDate(pos.positionData.lastUpdatedAt),
                totalXAmount: formatTokenBalance(BigInt(pos.positionData.totalXAmount.split('.')[0]), position.tokenX.decimal),
                totalYAmount: formatTokenBalance(BigInt(pos.positionData.totalYAmount.split('.')[0]), position.tokenY.decimal),
                feeX: formatTokenBalance(BigInt(pos.positionData.feeX.toString()), position.tokenX.decimal),
                feeY: formatTokenBalance(BigInt(pos.positionData.feeY.toString()), position.tokenY.decimal),
                publicKey: pos.publicKey.toString(),
                lowerBinId: pos.positionData.lowerBinId,
                upperBinId: pos.positionData.upperBinId,
                claimedFeeXAmount,
                claimedFeeYAmount,
                claimedFeeX: formatTokenBalance(BigInt(claimedFeeXAmount), position.tokenX.decimal),
                claimedFeeY: formatTokenBalance(BigInt(claimedFeeYAmount), position.tokenY.decimal),
            };
        });

        map.set(key, {
            lbPairPositionsData,
            nameX: tokenInfo.nameX,
            nameY: tokenInfo.nameY,
            price: tokenInfo.price,
            activeBin: position.lbPair.activeId,
            tokenXDecimal: position.tokenX.decimal,
            tokenYDecimal: position.tokenY.decimal
        });
    }));

    return map;
};

const WalletPage: React.FC = () => {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const wallet = pathname?.split('/').pop() || searchParams.get('wallet');
    const [dataMap, setDataMap] = useState<Map<string, PoolData> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            if (wallet) {
                try {
                    setIsLoading(true);
                    const map = await createDataMap(wallet);
                    setDataMap(map);
                } catch (error) {
                    console.error('Error fetching data:', error);
                    setError('Failed to fetch wallet data. Please try again later.');
                } finally {
                    setIsLoading(false);
                }
            }
        };

        fetchData();
    }, [wallet]);

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <span className="loading loading-spinner loading-lg"></span>
            </div>
        );
    }

    if (error) {
        return <div className="alert alert-error">{error}</div>;
    }

    if (!dataMap || dataMap.size === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-screen text-center">
                <div className="text-2xl font-bold mb-4">No open DLMM positions found</div>
                <div className="text-lg mb-6">Looks like you haven&apos;t dipped your toes in the DLMM pool yet!</div>
                <div className="text-md">
                    Ready to dive in? Open a position at{' '}
                    <a
                        href="https://app.meteora.ag/dlmm"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-700 underline"
                    >
                        Meteora DLMM
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4">
            <TableComponent dataMap={dataMap}/>
        </div>
    );
};

export default WalletPage;
