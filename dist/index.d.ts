declare const pkg: {
    name: string;
    aptName: string;
    description: string;
    source: "c";
    commands: {
        name: string;
        permissionTier: "read-write";
    }[];
    readonly commandDir: string;
};
export default pkg;
